import { useEffect, useMemo, useState } from "react";
import type { SessionState, RenderedWidget } from "./voice/types";
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
import { SHOWCASE_WIDGETS, SHOWCASE_CAPTION } from "./hud/showcaseBoard";
import "./App.css";

const ORDER: SessionState[] = ["idle", "listening", "processing", "speaking"];

// Contenido demo por estado (modo vitrina: ?hud= o tecla espacio)
function demoContent(state: SessionState): { caption: string; widgets: RenderedWidget[] } {
  switch (state) {
    case "listening":
      return { caption: "¿cómo viene el equipo hoy?", widgets: [] };
    case "speaking":
      return { caption: SHOWCASE_CAPTION, widgets: SHOWCASE_WIDGETS };
    default:
      return { caption: "", widgets: [] };
  }
}

function initialDemo(): SessionState | null {
  const value = new URLSearchParams(window.location.search).get("hud");
  return ORDER.find((s) => s === value) ?? null;
}

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

  // Demo: espacio alterna estados (idle → listening → processing → speaking),
  // esc vuelve a la sesión de voz real. ?hud=<estado> arranca en demo.
  const [demo, setDemo] = useState<SessionState | null>(initialDemo);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setDemo((d) => ORDER[(ORDER.indexOf(d ?? "idle") + 1) % ORDER.length]);
      } else if (e.code === "Escape") {
        setDemo(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ?still=1 → fija todo en su estado final (sin animaciones): útil para
  // capturar un frame estático del tablero ya desplegado.
  const params = new URLSearchParams(window.location.search);
  const still = params.has("still");
  // ?showcase=1 → cuando llegan métricas por voz, muestra el tablero curado
  // (mismos números que narra el backend con SOCIAL_SHOWCASE). Para el video.
  const showcase = params.has("showcase");

  const state = demo ?? session.state;
  const base = demo
    ? demoContent(demo)
    : { caption: session.caption, widgets: session.widgets };
  const caption = base.caption;
  const widgets =
    showcase && !demo && base.widgets.length > 0 ? SHOWCASE_WIDGETS : base.widgets;

  // Amplitud real del mic cuando la sesión está abierta (también en demo,
  // así "se siente vivo" hablando frente al panel).
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
