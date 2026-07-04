import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { FakeWakeWord, FakeTranscriber, FakeSpeaker } from "./adapters/fakes";

function setup() {
  const wake = new FakeWakeWord();
  const stt = new FakeTranscriber();
  const tts = new FakeSpeaker();
  const converse = vi.fn().mockResolvedValue({
    narration: "tres atrasadas",
    widgets: [{ type: "kpi_card", title: "Atrasadas", data: { value: 3 } }],
  });
  const hook = renderHook(() =>
    useSession({ wake, stt, tts, converse, closingPhrase: "listo", silenceMs: 30000 }),
  );
  return { ...hook, wake, stt, tts, converse };
}

describe("useSession", () => {
  it("flujo completo: wake -> hablar -> respuesta -> render + speak", async () => {
    const { result, wake, stt, tts, converse } = setup();
    expect(result.current.state).toBe("idle");

    act(() => wake.trigger());
    expect(result.current.state).toBe("speaking"); // saluda a Luciano antes de abrir el mic
    act(() => tts.finish());
    expect(result.current.state).toBe("listening");

    act(() => stt.emit("cuántas atrasadas", true));

    await waitFor(() => expect(converse).toHaveBeenCalledWith("cuántas atrasadas"));
    await waitFor(() => expect(result.current.state).toBe("speaking"));
    expect(result.current.widgets[0].data).toEqual({ value: 3 });

    act(() => tts.finish());
    await waitFor(() => expect(result.current.state).toBe("listening"));
  });

  it("si converse rechaza, vuelve a listening (no queda pegado en processing)", async () => {
    const wake = new FakeWakeWord();
    const stt = new FakeTranscriber();
    const tts = new FakeSpeaker();
    const converse = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useSession({ wake, stt, tts, converse, closingPhrase: "listo", silenceMs: 30000 }),
    );
    act(() => wake.trigger());
    act(() => tts.finish()); // termina el saludo → escucha
    act(() => stt.emit("algo", true));
    await waitFor(() => expect(converse).toHaveBeenCalled());
    // el error se DICE (speaking), no falla mudo; al terminar vuelve a escuchar
    await waitFor(() => expect(result.current.state).toBe("speaking"));
    act(() => tts.finish());
    await waitFor(() => expect(result.current.state).toBe("listening"));
  });

  it("pausa el wake word durante la sesión y lo reanuda al volver a idle", () => {
    // Chrome permite UN SpeechRecognition activo por página: si el wake sigue
    // vivo, su auto-restart mata al transcriptor y la consulta nunca llega.
    const { result, wake, stt, tts } = setup();
    expect(wake.active).toBe(true);

    act(() => wake.trigger());
    act(() => tts.finish()); // saludo terminado → escucha
    expect(result.current.state).toBe("listening");
    expect(wake.active).toBe(false); // pausado mientras la sesión escucha

    act(() => stt.emit("listo", true)); // cierra la sesión
    expect(result.current.state).toBe("idle");
    expect(wake.active).toBe(true); // reanudado en idle
  });

  it('barge-in: "Alfred" mientras habla corta el TTS y abre el mic', () => {
    const { result, wake, tts } = setup();
    act(() => wake.trigger());
    expect(result.current.state).toBe("speaking");
    expect(wake.active).toBe(true); // el wake sigue escuchando mientras Alfred habla

    act(() => wake.trigger()); // "Alfred" de nuevo = interrumpir
    expect(result.current.state).toBe("listening");
    expect(wake.active).toBe(false); // en listening manda el transcriptor

    act(() => tts.finish()); // el ttsEnd del speak cortado no debe llegar
    expect(result.current.state).toBe("listening");
  });

  it("al abrir el mic apaga el wake ANTES de arrancar el transcriptor (Chrome: un reconocimiento por página)", () => {
    const { wake, stt, tts } = setup();
    const wakeStop = vi.spyOn(wake, "stop");
    const sttStart = vi.spyOn(stt, "start");
    act(() => wake.trigger());
    act(() => tts.finish()); // saludo terminado → listening
    expect(wakeStop).toHaveBeenCalled();
    expect(sttStart).toHaveBeenCalled();
    expect(Math.min(...wakeStop.mock.invocationCallOrder)).toBeLessThan(
      sttStart.mock.invocationCallOrder[0],
    );
  });

  it("frase de cierre cierra la sesión", () => {
    const { result, wake, stt, tts } = setup();
    act(() => wake.trigger());
    act(() => tts.finish());
    act(() => stt.emit("listo", true));
    expect(result.current.state).toBe("idle");
  });
});
