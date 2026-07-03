import type { SessionState, SessionEvent, Effect } from "./types";

export const initialState: SessionState = "idle";

// Español neutro (nada de voseo). El saludo suena ANTES de abrir el mic:
// si Alfred hablara con el mic abierto, se transcribiría a sí mismo.
export const WAKE_GREETINGS = [
  "Hola Luciano, ¿en qué puedo ayudarte?",
  "Hola Luciano, qué gusto escucharte.",
  "Aquí estoy, Luciano. Cuéntame.",
];

export const CONVERSE_ERROR_NARRATION = "Perdón, no pude procesar eso. ¿Puedes repetirlo?";

// Rotación de saludos (mismo patrón module-level que lastFinalTranscript).
let greetingIndex = 0;

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
        const greeting = WAKE_GREETINGS[greetingIndex % WAKE_GREETINGS.length];
        greetingIndex += 1;
        // Saluda primero; ttsEnd (en speaking) abre el mic y arma el timer.
        return {
          state: "speaking",
          effects: [{ kind: "speak", text: greeting }],
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
      if (event.kind === "converseFailed") {
        // Nunca fallar mudo: dice el error y ttsEnd lo devuelve a listening.
        return {
          state: "speaking",
          effects: [{ kind: "speak", text: CONVERSE_ERROR_NARRATION }],
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
