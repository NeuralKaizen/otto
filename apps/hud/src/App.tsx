import { useMemo } from "react";
import { useSession } from "./voice/useSession";
import { WebSpeechWakeWord, WebSpeechTranscriber } from "./voice/adapters/webSpeech";
import { ElevenLabsSpeaker } from "./voice/adapters/elevenLabsSpeaker";
import { useAgentClient } from "./api/useAgentClient";
import { WattsonScene } from "./hud/scene/WattsonScene";
import { useMicLevel } from "./hud/useMicLevel";
import { Chrome } from "./hud/Chrome";
import { Captions } from "./hud/Captions";
import { Canvas } from "./hud/Canvas";
import { OrbitalRings } from "./hud/OrbitalRings";
import { HudTelemetry } from "./hud/HudTelemetry";
import "./App.css";

export default function App() {
  const converse = useAgentClient();

  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new ElevenLabsSpeaker(),
    converse,
    closingPhrase: "listo",
    silenceMs: 35000,
  }), [converse]);

  const session = useSession(deps);

  // ?still=1 → fija todo en su estado final (sin animaciones): útil para
  // capturar un frame estático del tablero ya desplegado.
  const params = new URLSearchParams(window.location.search);
  const still = params.has("still");

  const state = session.state;
  const caption = session.caption;
  const widgets = session.widgets;

  // Amplitud real del mic cuando la sesión está abierta.
  const getMicLevel = useMicLevel(state === "listening" || state === "speaking");

  return (
    <div className={still ? "hud still" : "hud"} data-state={state}>
      <WattsonScene state={state} getAmplitude={getMicLevel} />
      <OrbitalRings />
      <div className="hud-vignette" aria-hidden="true" />
      <div className="hud-grain" aria-hidden="true" />
      <Chrome />
      <HudTelemetry />
      <main className="hud-stage">
        <Canvas widgets={widgets} />
        <Captions text={caption} />
      </main>
    </div>
  );
}
