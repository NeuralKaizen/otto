import type { SessionState, SessionEvent, Effect } from "./types";

export const initialState: SessionState = "idle";

interface Reduction {
  state: SessionState;
  effects: Effect[];
}

// El último transcript final visto en la sesión actual (lo necesita speechEnd).
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
      return { state, effects: [] };

    case "listening":
      if (event.kind === "closingPhrase" || event.kind === "timeout") {
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
        return {
          state: "processing",
          effects: [
            { kind: "stopListening" },
            { kind: "disarmSilenceTimer" },
            { kind: "callConverse", text: lastFinalTranscript },
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
            { kind: "startListening" },
            { kind: "armSilenceTimer" },
          ],
        };
      }
      if (event.kind === "ttsEnd") {
        return {
          state: "listening",
          effects: [{ kind: "startListening" }, { kind: "armSilenceTimer" }],
        };
      }
      return { state, effects: [] };
  }
}
