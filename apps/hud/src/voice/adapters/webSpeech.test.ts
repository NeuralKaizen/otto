import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isWakeWord, WebSpeechTranscriber } from "./webSpeech";

describe("isWakeWord", () => {
  it.each(["alfred", "Alfred", "alfredo", "hey Alfredo, cómo va", "ALFRED"])(
    "matchea %j",
    (t) => expect(isWakeWord(t)).toBe(true),
  );

  it.each(["whatsapp", "wattson", "hola", "", "al fred"])(
    "NO matchea %j",
    (t) => expect(isWakeWord(t)).toBe(false),
  );
});

import { collectTranscript } from "./webSpeech";

describe("collectTranscript", () => {
  const seg = (t: string, isFinal: boolean) => ({ isFinal, 0: { transcript: t } });
  it("acumula la frase completa en vez de fragmentos sueltos", () => {
    const r = collectTranscript([seg("métricas de ", true), seg("instagram", false)]);
    expect(r).toEqual({ finals: "métricas de", interim: "instagram" });
  });
  it("solo finales → interim vacío", () => {
    const r = collectTranscript([seg("cómo vienen ", true), seg("mis métricas", true)]);
    expect(r).toEqual({ finals: "cómo vienen mis métricas", interim: "" });
  });
});

// Chrome corta el reconocimiento tras unos segundos de silencio: el
// transcriptor debe reiniciarse solo (mismo patrón que el wake detector).
describe("WebSpeechTranscriber — robustez", () => {
  class FakeRecognition {
    static instances: FakeRecognition[] = [];
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((e: unknown) => void) | undefined;
    onend: (() => void) | undefined;
    onerror: ((e: unknown) => void) | undefined;
    startCalls = 0;
    stopCalls = 0;
    constructor() { FakeRecognition.instances.push(this); }
    start() { this.startCalls++; }
    stop() { this.stopCalls++; }
  }

  beforeEach(() => {
    FakeRecognition.instances = [];
    (window as any).SpeechRecognition = FakeRecognition;
  });
  afterEach(() => {
    delete (window as any).SpeechRecognition;
    vi.restoreAllMocks();
  });

  it("se reinicia cuando el reconocimiento se corta solo (onend)", () => {
    const t = new WebSpeechTranscriber();
    t.start(() => {}, () => {});
    const rec = FakeRecognition.instances[0];
    expect(rec.startCalls).toBe(1);
    rec.onend?.(); // Chrome corta por silencio
    expect(rec.startCalls).toBe(2);
  });

  it("NO se reinicia después de stop() explícito", () => {
    const t = new WebSpeechTranscriber();
    t.start(() => {}, () => {});
    const rec = FakeRecognition.instances[0];
    t.stop();
    rec.onend?.(); // el stop() real también dispara onend
    expect(rec.startCalls).toBe(1);
  });

  it("loguea un warning en onerror en vez de morir mudo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = new WebSpeechTranscriber();
    t.start(() => {}, () => {});
    const rec = FakeRecognition.instances[0];
    rec.onerror?.({ error: "no-speech" });
    expect(warn).toHaveBeenCalled();
  });
});
