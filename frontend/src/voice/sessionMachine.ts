import type { SessionState, SessionEvent, Effect } from "./types";

export const initialState: SessionState = "idle";

interface Reduction {
  state: SessionState;
  effects: Effect[];
}

// El último transcript final visto en la sesión actual (lo necesita speechEnd).
// TODO(plan-2): lift into a state struct for purity + multi-instance safety.
let lastFinalTranscript = "";

export function reduce(state: SessionState, event: SessionEvent): Reduction {
  switch (state) {
    case "idle":
      if (event.kind === "wakeDetected") {
        lastFinalTranscript = "";
        return {
          state: "listening",
          effects: [{ kind: "startListening" }, { kind: "armSilenceTimer" }],
        };
      }
      return { state, effects: [] }; // otros eventos sin sesión abierta: no-op

    case "listening":
      if (event.kind === "closingPhrase" || event.kind === "timeout") {
        lastFinalTranscript = "";
        return {
          state: "idle",
          effects: [{ kind: "stopListening" }, { kind: "disarmSilenceTimer" }],
        };
      }
      if (event.kind === "transcript" && event.final) {
        lastFinalTranscript = event.text;
        return { state, effects: [{ kind: "armSilenceTimer" }] };
      }
      if (event.kind === "speechEnd" && lastFinalTranscript) {
        const text = lastFinalTranscript;
        lastFinalTranscript = ""; // consumir: evita re-enviar la consulta anterior
        return {
          state: "processing",
          effects: [
            { kind: "stopListening" },
            { kind: "disarmSilenceTimer" },
            { kind: "callConverse", text },
          ],
        };
      }
      return { state, effects: [] };

    case "processing":
      if (event.kind === "response") {
        return {
          state: "speaking",
          effects: [
            { kind: "render", widgets: event.widgets },
            { kind: "speak", text: event.narration },
          ],
        };
      }
      return { state, effects: [] };

    case "speaking":
      if (event.kind === "bargeIn") {
        return {
          state: "listening",
          effects: [
            { kind: "stopSpeaking" },
            { kind: "disarmSilenceTimer" },
            { kind: "startListening" },
            { kind: "armSilenceTimer" },
          ],
        };
      }
      if (event.kind === "ttsEnd") {
        return {
          state: "listening",
          effects: [
            { kind: "disarmSilenceTimer" },
            { kind: "startListening" },
            { kind: "armSilenceTimer" },
          ],
        };
      }
      return { state, effects: [] };
  }
}
