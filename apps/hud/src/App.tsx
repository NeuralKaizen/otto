import { useEffect, useMemo, useState } from "react";
import type { SessionState, RenderedWidget } from "./voice/types";
import { useSession } from "./voice/useSession";
import { WebSpeechWakeWord, WebSpeechTranscriber } from "./voice/adapters/webSpeech";
import { ElevenLabsSpeaker } from "./voice/adapters/elevenLabsSpeaker";
import { createAgentClient } from "./api/agentClient";
import { WattsonScene } from "./hud/scene/WattsonScene";
import { useMicLevel } from "./hud/useMicLevel";
import { Chrome } from "./hud/Chrome";
import { Captions } from "./hud/Captions";
import { Canvas } from "./hud/Canvas";
import { OrbitalRings } from "./hud/OrbitalRings";
import { HudTelemetry } from "./hud/HudTelemetry";
import "./App.css";

const ORDER: SessionState[] = ["idle", "listening", "processing", "speaking"];

// Contenido demo por estado (modo vitrina: ?hud= o tecla espacio)
function demoContent(state: SessionState): { caption: string; widgets: RenderedWidget[] } {
  switch (state) {
    case "listening":
      return { caption: "¿cómo viene el equipo hoy?", widgets: [] };
    case "speaking":
      return {
        caption: "Tenés doce tareas activas y tres atrasadas. Persona B concentra la mayor carga.",
        widgets: [
          { type: "kpi_card", title: "Activas", data: { value: 12 } },
          { type: "kpi_card", title: "Atrasadas", data: { value: 3 } },
          {
            type: "table",
            title: "Por persona",
            data: [
              { persona: "Persona A", activas: 4, atrasadas: 0 },
              { persona: "Persona B", activas: 5, atrasadas: 2 },
              { persona: "Persona C", activas: 3, atrasadas: 1 },
            ],
          },
        ],
      };
    default:
      return { caption: "", widgets: [] };
  }
}

function initialDemo(): SessionState | null {
  const value = new URLSearchParams(window.location.search).get("hud");
  return ORDER.find((s) => s === value) ?? null;
}

export default function App() {
  const agentClient = useMemo(() => createAgentClient(), []);
  useEffect(() => () => agentClient.dispose(), [agentClient]);

  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new ElevenLabsSpeaker(),
    converse: agentClient.converse,
    closingPhrase: "listo",
    silenceMs: 35000,
  }), [agentClient]);

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

  const state = demo ?? session.state;
  const { caption, widgets } = demo
    ? demoContent(demo)
    : { caption: session.caption, widgets: session.widgets };

  // Amplitud real del mic cuando la sesión está abierta (también en demo,
  // así "se siente vivo" hablando frente al panel).
  const getMicLevel = useMicLevel(state === "listening" || state === "speaking");

  return (
    <div className="hud" data-state={state}>
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
