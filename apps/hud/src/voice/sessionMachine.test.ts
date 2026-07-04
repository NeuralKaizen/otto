import { describe, it, expect } from "vitest";
import { reduce, initialState, WAKE_GREETINGS, CONVERSE_ERROR_NARRATION } from "./sessionMachine";
import type { SessionSnapshot } from "./sessionMachine";
import type { RenderedWidget, SessionState } from "./types";

const widgets: RenderedWidget[] = [{ type: "kpi_card", title: "X", data: { value: 1 } }];

// Snapshot en una fase dada, con el resto en valores iniciales.
const at = (phase: SessionState, extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialState,
  phase,
  ...extra,
});

describe("sessionMachine", () => {
  it("idle + wakeDetected -> speaking: saluda a Luciano ANTES de abrir el mic (no se transcribe a sí mismo)", () => {
    const r = reduce(initialState, { kind: "wakeDetected" });
    expect(r.state.phase).toBe("speaking");
    const speak = r.effects.find((e) => e.kind === "speak");
    expect(speak && WAKE_GREETINGS.includes(speak.text)).toBe(true);
    expect(r.effects).not.toContainEqual({ kind: "startListening" });
  });

  it("los saludos rotan entre despertares", () => {
    const first = reduce(initialState, { kind: "wakeDetected" });
    const firstSpeak = first.effects.find((e) => e.kind === "speak");
    // la próxima sesión arranca desde idle pero conserva el índice de rotación
    const second = reduce(at("idle", { greetingIndex: first.state.greetingIndex }), { kind: "wakeDetected" });
    const secondSpeak = second.effects.find((e) => e.kind === "speak");
    expect(firstSpeak && secondSpeak && firstSpeak.text !== secondSpeak.text).toBe(true);
  });

  it("listening + closingPhrase -> idle, deja de escuchar", () => {
    const r = reduce(at("listening"), { kind: "closingPhrase" });
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("listening + speechEnd con transcript -> processing, llama converse", () => {
    const s = reduce(at("listening"), { kind: "transcript", text: "hola wattson", final: true }).state;
    const r = reduce(s, { kind: "speechEnd" });
    expect(r.state.phase).toBe("processing");
    expect(r.effects).toContainEqual({ kind: "callConverse", text: "hola wattson" });
  });

  it("processing + response -> speaking, renderiza y habla", () => {
    const r = reduce(at("processing"), { kind: "response", narration: "tres", widgets });
    expect(r.state.phase).toBe("speaking");
    expect(r.effects).toContainEqual({ kind: "render", widgets });
    expect(r.effects).toContainEqual({ kind: "speak", text: "tres" });
  });

  it("speaking + bargeIn -> listening, corta el TTS", () => {
    const r = reduce(at("speaking"), { kind: "bargeIn" });
    expect(r.state.phase).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "stopSpeaking" });
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it('speaking + wakeDetected -> listening: decir "Alfred" mientras habla interrumpe (barge-in)', () => {
    const r = reduce(at("speaking"), { kind: "wakeDetected" });
    expect(r.state.phase).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "stopSpeaking" });
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("speaking + ttsEnd -> listening (la sesión sigue)", () => {
    const r = reduce(at("speaking"), { kind: "ttsEnd" });
    expect(r.state.phase).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("listening + timeout -> idle (red de seguridad)", () => {
    const r = reduce(at("listening"), { kind: "timeout" });
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("idle ignora transcript (no hay sesión abierta)", () => {
    const r = reduce(at("idle"), { kind: "transcript", text: "ruido", final: true });
    expect(r.state.phase).toBe("idle");
    expect(r.effects).toEqual([]);
  });

  it("processing + converseFailed -> speaking: dice el error en voz alta (nunca falla mudo)", () => {
    const r = reduce(at("processing"), { kind: "converseFailed" });
    expect(r.state.phase).toBe("speaking");
    expect(r.effects).toContainEqual({ kind: "speak", text: CONVERSE_ERROR_NARRATION });
  });

  it("speechEnd espurio tras consumir el transcript NO re-dispara converse", () => {
    // turno 1: transcript + speechEnd consumen "hola wattson"
    const heard = reduce(at("listening"), { kind: "transcript", text: "hola wattson", final: true }).state;
    reduce(heard, { kind: "speechEnd" });
    // ahora un speechEnd sin nuevo transcript no debe llamar converse
    const r = reduce(at("listening", { greetingIndex: heard.greetingIndex }), { kind: "speechEnd" });
    expect(r.state.phase).toBe("listening");
    expect(r.effects).toEqual([]);
  });

  it("reduce es pura: dos máquinas no comparten estado a nivel módulo", () => {
    // la máquina A escucha un transcript…
    reduce(at("listening"), { kind: "transcript", text: "consulta de A", final: true });
    // …y una máquina B, que nunca lo vio, no debe dispararlo en su speechEnd
    const r = reduce(at("listening"), { kind: "speechEnd" });
    expect(r.effects).toEqual([]);
  });
});
