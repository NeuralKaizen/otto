import type { SessionState, SessionEvent, Effect } from "./types";

// Español neutro (nada de voseo). El saludo suena ANTES de abrir el mic:
// si Alfred hablara con el mic abierto, se transcribiría a sí mismo.
export const WAKE_GREETINGS = [
  "Hola Luciano, ¿en qué puedo ayudarte?",
  "Hola Luciano, qué gusto escucharte.",
  "Aquí estoy, Luciano. Cuéntame.",
];

export const CONVERSE_ERROR_NARRATION = "Perdón, no pude procesar eso. ¿Puedes repetirlo?";

// Todo el estado de la máquina vive acá (reduce es pura: nada a nivel módulo).
export interface SessionSnapshot {
  phase: SessionState;
  // El último transcript final visto en la sesión actual (lo necesita speechEnd).
  lastFinalTranscript: string;
  // Rotación de saludos entre despertares.
  greetingIndex: number;
  // ¿Se puede interrumpir a Alfred diciendo "Alfred" AHORA? Solo cuando habla
  // una RESPUESTA — nunca durante el saludo. El wake continuo dispara varios
  // onWake por un solo "Alfred", y si el saludo se pudiera interrumpir, esas
  // llamadas extra lo cortarían solo. Ver useSession (el wake tampoco se
  // enciende durante el saludo).
  bargeInArmed: boolean;
}

export const initialState: SessionSnapshot = {
  phase: "idle",
  lastFinalTranscript: "",
  greetingIndex: 0,
  bargeInArmed: false,
};

interface Reduction {
  state: SessionSnapshot;
  effects: Effect[];
}

export function reduce(snap: SessionSnapshot, event: SessionEvent): Reduction {
  switch (snap.phase) {
    case "idle":
      if (event.kind === "wakeDetected") {
        const greeting = WAKE_GREETINGS[snap.greetingIndex % WAKE_GREETINGS.length];
        // Saluda primero; ttsEnd (en speaking) abre el mic y arma el timer.
        // bargeInArmed=false: el saludo no se puede cortar (ver comentario arriba).
        return {
          state: {
            phase: "speaking",
            lastFinalTranscript: "",
            greetingIndex: snap.greetingIndex + 1,
            bargeInArmed: false,
          },
          effects: [{ kind: "speak", text: greeting }],
        };
      }
      return { state: snap, effects: [] }; // otros eventos sin sesión abierta: no-op

    case "listening":
      if (event.kind === "closingPhrase" || event.kind === "timeout") {
        return {
          state: { ...snap, phase: "idle", lastFinalTranscript: "" },
          effects: [{ kind: "stopListening" }, { kind: "disarmSilenceTimer" }],
        };
      }
      if (event.kind === "transcript" && event.final) {
        return {
          state: { ...snap, lastFinalTranscript: event.text },
          effects: [{ kind: "armSilenceTimer" }],
        };
      }
      if (event.kind === "speechEnd" && snap.lastFinalTranscript) {
        return {
          // consumir el transcript: evita re-enviar la consulta anterior
          state: { ...snap, phase: "processing", lastFinalTranscript: "" },
          effects: [
            { kind: "stopListening" },
            { kind: "disarmSilenceTimer" },
            { kind: "callConverse", text: snap.lastFinalTranscript },
          ],
        };
      }
      return { state: snap, effects: [] };

    case "processing":
      if (event.kind === "response") {
        // Respuesta: SÍ se puede interrumpir diciendo "Alfred" (barge-in real).
        return {
          state: { ...snap, phase: "speaking", bargeInArmed: true },
          effects: [
            { kind: "render", widgets: event.widgets },
            { kind: "speak", text: event.narration },
          ],
        };
      }
      if (event.kind === "converseFailed") {
        // Nunca fallar mudo: dice el error y ttsEnd lo devuelve a listening.
        return {
          state: { ...snap, phase: "speaking" },
          effects: [{ kind: "speak", text: CONVERSE_ERROR_NARRATION }],
        };
      }
      return { state: snap, effects: [] };

    case "speaking":
      // wakeDetected acá = decir "Alfred" mientras Alfred habla. Solo interrumpe
      // si está armado (respuesta), nunca durante el saludo: así los onWake
      // repetidos del "Alfred" inicial no cortan el saludo.
      if (event.kind === "bargeIn" || (event.kind === "wakeDetected" && snap.bargeInArmed)) {
        return {
          state: { ...snap, phase: "listening" },
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
          state: { ...snap, phase: "listening" },
          effects: [
            { kind: "disarmSilenceTimer" },
            { kind: "startListening" },
            { kind: "armSilenceTimer" },
          ],
        };
      }
      return { state: snap, effects: [] };
  }
}
