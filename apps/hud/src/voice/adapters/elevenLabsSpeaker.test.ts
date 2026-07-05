import { describe, it, expect, vi, beforeEach } from "vitest";
import { ElevenLabsSpeaker } from "./elevenLabsSpeaker";
import type { Speaker } from "../types";

class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  playCalls = 0;
  playResult: Promise<void>;
  constructor(src: string, playResult: Promise<void> = Promise.resolve()) {
    this.src = src;
    this.playResult = playResult;
  }
  play() { this.playCalls++; return this.playResult; }
  pause() { this.paused = true; }
}

class FakeFallback implements Speaker {
  spoken: string[] = [];
  stops = 0;
  lastOnEnd: (() => void) | null = null;
  speak(text: string, onEnd: () => void) { this.spoken.push(text); this.lastOnEnd = onEnd; }
  stop() { this.stops++; }
}

function audioFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "audio/mpeg" },
    blob: async () => new Blob(["mp3"]),
  });
}

// jsdom no implementa createObjectURL: lo stubbeamos.
beforeEach(() => {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:fake");
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function setup(fetchMock: ReturnType<typeof vi.fn> = audioFetch(), playResult: Promise<void> = Promise.resolve(), customFallback?: Speaker) {
  let audio: FakeAudio | null = null;
  const fallback = customFallback ?? new FakeFallback();
  const speaker = new ElevenLabsSpeaker({
    apiUrl: "http://x",
    fetchImpl: fetchMock as unknown as typeof fetch,
    createAudio: (src) => (audio = new FakeAudio(src, playResult)) as unknown as HTMLAudioElement,
    fallback: fallback as unknown as Speaker,
  });
  return { speaker, fallback: fallback as unknown as FakeFallback, fetchMock, get audio() { return audio; } };
}

// Deja drenar la cadena de promesas interna del speaker.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ElevenLabsSpeaker", () => {
  it("POSTea a /voice/tts, reproduce y llama onEnd al terminar", async () => {
    const ctx = setup();
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    await flush();
    expect(ctx.fetchMock).toHaveBeenCalledWith("http://x/voice/tts", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((ctx.fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ text: "hola" });
    expect(ctx.audio!.playCalls).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
    ctx.audio!.onended!();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(ctx.fallback.spoken).toEqual([]);
  });

  it("si el fetch falla, degrada al fallback y onEnd llega vía el fallback", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("network down"));
    const { speaker, fallback } = setup(bad);
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
    expect(onEnd).not.toHaveBeenCalled();
    fallback.lastOnEnd!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("si el status no es ok, degrada al fallback", async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: { get: () => "application/json" } });
    const { speaker, fallback } = setup(bad);
    speaker.speak("hola", vi.fn());
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
  });

  it("si la respuesta no es audio (mock devuelve JSON), degrada al fallback", async () => {
    const mockResp = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json; charset=utf-8" },
      blob: async () => new Blob(["{}"]),
    });
    const { speaker, fallback } = setup(mockResp);
    speaker.speak("hola", vi.fn());
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
  });

  it("si play() rechaza, degrada al fallback una sola vez", async () => {
    const ctx = setup(audioFetch(), Promise.reject(new Error("autoplay blocked")));
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    await flush();
    expect(ctx.fallback.spoken).toEqual(["hola"]);
    ctx.fallback.lastOnEnd!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stop() corta el audio, revoca el blob y NO dispara onEnd", async () => {
    const ctx = setup();
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    await flush();
    ctx.speaker.stop();
    expect(ctx.audio!.paused).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(ctx.fallback.stops).toBeGreaterThan(0);
    expect(onEnd).not.toHaveBeenCalled();
    ctx.speaker.stop(); // idempotente: no explota
  });

  it("stop() antes de que llegue el audio: no reproduce, no llama onEnd ni fallback", async () => {
    let resolveFetch!: (v: unknown) => void;
    const slow = vi.fn().mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    const ctx = setup(slow);
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    ctx.speaker.stop();
    resolveFetch({ ok: true, headers: { get: () => "audio/mpeg" }, blob: async () => new Blob(["mp3"]) });
    await flush();
    expect(ctx.audio).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    expect(ctx.fallback.spoken).toEqual([]);
  });

  it("si el audio falla al reproducir (onerror), degrada al fallback", async () => {
    const ctx = setup();
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    await flush();
    ctx.audio!.onerror!();
    expect(ctx.fallback.spoken).toEqual(["hola"]);
    expect(onEnd).not.toHaveBeenCalled();
    ctx.fallback.lastOnEnd!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("speak() re-entrante sin stop() externo: cancela la sesión anterior y su onEnd no llega", async () => {
    const ctx = setup();
    const firstEnd = vi.fn();
    ctx.speaker.speak("uno", firstEnd);
    await flush();
    const firstAudio = ctx.audio!;
    const firstOnEnded = firstAudio.onended;

    const secondEnd = vi.fn();
    ctx.speaker.speak("dos", secondEnd);
    await flush();
    expect(firstAudio.paused).toBe(true);
    firstOnEnded?.(); // si el handler viejo quedara vivo, sería un onEnd fantasma
    expect(firstEnd).not.toHaveBeenCalled();

    ctx.audio!.onended!();
    expect(secondEnd).toHaveBeenCalledTimes(1);
    expect(ctx.fallback.spoken).toEqual([]);
  });

  it("si el fallback lanza sincrónicamente, onEnd igual se dispara una sola vez", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("network down"));
    const throwingFallback: Speaker = {
      speak() { throw new Error("no speechSynthesis"); },
      stop() {},
    };
    const ctx = setup(bad, Promise.resolve(), throwingFallback);
    const onEnd = vi.fn();
    ctx.speaker.speak("hola", onEnd);
    await flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

