// Estados de la sesión (OTTO_CONTEXT: máquina de estados, el corazón)
export type SessionState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking";

// Eventos que disparan transiciones (independientes del audio real)
export type SessionEvent =
  | { kind: "wakeDetected" }
  | { kind: "transcript"; text: string; final: boolean }
  | { kind: "closingPhrase" }
  | { kind: "speechEnd" }            // endpointing: el usuario terminó de hablar
  | { kind: "bargeIn" }             // el usuario habla mientras Wattson habla
  | { kind: "response"; narration: string; widgets: RenderedWidget[] }
  | { kind: "ttsEnd" }
  | { kind: "timeout" }            // silencio largo de seguridad
  | { kind: "converseFailed" };      // /converse falló: volver a escuchar

export interface RenderedWidget {
  type: string;
  title: string;
  data: unknown;
}

// Efectos que la FSM le pide al mundo exterior (la FSM no toca audio)
export type Effect =
  | { kind: "startListening" }
  | { kind: "stopListening" }
  | { kind: "callConverse"; text: string }
  | { kind: "speak"; text: string }
  | { kind: "stopSpeaking" }
  | { kind: "render"; widgets: RenderedWidget[] }
  | { kind: "armSilenceTimer" }
  | { kind: "disarmSilenceTimer" };

// --- Interfaces de adaptadores swappables ---
export interface WakeWordDetector {
  start(onWake: () => void): void;
  stop(): void;
}

export interface Transcriber {
  start(onPartial: (text: string) => void, onFinal: (text: string) => void): void;
  stop(): void;
}

export interface Speaker {
  speak(text: string, onEnd: () => void): void;
  stop(): void; // idempotente
}
