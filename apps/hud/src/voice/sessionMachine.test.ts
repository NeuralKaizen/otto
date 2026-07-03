import { describe, it, expect } from "vitest";
import { reduce, initialState } from "./sessionMachine";
import type { RenderedWidget } from "./types";

const widgets: RenderedWidget[] = [{ type: "kpi_card", title: "X", data: { value: 1 } }];

describe("sessionMachine", () => {
  it("idle + wakeDetected -> listening, empieza a escuchar", () => {
    const r = reduce(initialState, { kind: "wakeDetected" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
    expect(r.effects).toContainEqual({ kind: "armSilenceTimer" });
  });

  it("listening + closingPhrase -> idle, deja de escuchar", () => {
    const r = reduce("listening", { kind: "closingPhrase" });
    expect(r.state).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("listening + speechEnd con transcript -> processing, llama converse", () => {
    let s = reduce("listening", { kind: "transcript", text: "hola wattson", final: true }).state;
    const r = reduce(s, { kind: "speechEnd" });
    expect(r.state).toBe("processing");
    expect(r.effects).toContainEqual({ kind: "callConverse", text: "hola wattson" });
  });

  it("processing + response -> speaking, renderiza y habla", () => {
    const r = reduce("processing", { kind: "response", narration: "tres", widgets });
    expect(r.state).toBe("speaking");
    expect(r.effects).toContainEqual({ kind: "render", widgets });
    expect(r.effects).toContainEqual({ kind: "speak", text: "tres" });
  });

  it("speaking + bargeIn -> listening, corta el TTS", () => {
    const r = reduce("speaking", { kind: "bargeIn" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "stopSpeaking" });
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("speaking + ttsEnd -> listening (la sesión sigue)", () => {
    const r = reduce("speaking", { kind: "ttsEnd" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("listening + timeout -> idle (red de seguridad)", () => {
    const r = reduce("listening", { kind: "timeout" });
    expect(r.state).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("idle ignora transcript (no hay sesión abierta)", () => {
    const r = reduce("idle", { kind: "transcript", text: "ruido", final: true });
    expect(r.state).toBe("idle");
    expect(r.effects).toEqual([]);
  });

  it("processing + converseFailed -> listening (vuelve a escuchar)", () => {
    const r = reduce("processing", { kind: "converseFailed" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("speechEnd espurio tras consumir el transcript NO re-dispara converse", () => {
    // turno 1: transcript + speechEnd consumen "hola wattson"
    reduce("listening", { kind: "transcript", text: "hola wattson", final: true });
    reduce("listening", { kind: "speechEnd" });
    // ahora un speechEnd sin nuevo transcript no debe llamar converse
    const r = reduce("listening", { kind: "speechEnd" });
    expect(r.state).toBe("listening");
    expect(r.effects).toEqual([]);
  });
});
