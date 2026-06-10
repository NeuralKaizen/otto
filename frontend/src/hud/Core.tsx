import type { SessionState } from "../voice/types";

const LABEL: Record<SessionState, string> = {
  idle: "en reposo",
  listening: "escuchando",
  processing: "pensando",
  speaking: "hablando",
};

// Núcleo audio-reactivo. amplitude 0..1 escala el pulso (mic al escuchar, TTS al hablar).
export function Core({ state, amplitude }: { state: SessionState; amplitude: number }) {
  const scale = 1 + amplitude * 0.6;
  return (
    <div className={`hud-core core-${state}`} aria-label={LABEL[state]}>
      <div className="core-orb" style={{ transform: `scale(${scale})` }} />
      <div className="core-state">{LABEL[state]}</div>
    </div>
  );
}
