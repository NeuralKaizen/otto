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
import "./App.css";

const ORDER: SessionState[] = ["idle", "listening", "processing", "speaking"];

// Contenido demo por estado (modo vitrina: ?hud= o tecla espacio)
function demoContent(state: SessionState): { caption: string; widgets: RenderedWidget[] } {
  switch (state) {
    case "listening":
      return { caption: "¿cómo viene el equipo hoy?", widgets: [] };
    case "speaking":
      return {
        caption: "Tus métricas de Instagram, Luciano: 34.4 mil seguidores, engagement del 4.2% y en alza.",
        widgets: [
          { type: "kpi_card", title: "Seguidores", data: { value: "34.4K", delta: "+3.1%", spark: [30, 31, 31, 32, 33, 33, 34] } },
          { type: "kpi_card", title: "Engagement", data: { value: "4.2%", delta: "+0.4pt", spark: [3.6, 3.8, 3.7, 4.0, 4.1, 4.0, 4.2] } },
          { type: "kpi_card", title: "Alcance 7d", data: { value: "128K", delta: "+12%", spark: [90, 96, 101, 110, 116, 121, 128] } },
          { type: "kpi_card", title: "Guardados", data: { value: "2.1K", delta: "-2%", spark: [2.3, 2.2, 2.2, 2.1, 2.0, 2.1, 2.1] } },
          {
            type: "metric_chart",
            title: "Top contenido",
            data: {
              subtitle: "@lucianomusellaa · instagram",
              unit: "likes",
              points: [
                { name: "Reel gym", value: 12800 },
                { name: "Carrusel", value: 9400 },
                { name: "Colab", value: 7100 },
                { name: "Story set", value: 5200 },
                { name: "Live Q&A", value: 3600 },
              ],
            },
          },
          {
            type: "metric_chart",
            title: "Alcance · 7d",
            data: {
              subtitle: "impresiones / día",
              unit: "imp",
              points: [
                { name: "Lu", value: 90000 },
                { name: "Ma", value: 96000 },
                { name: "Mi", value: 101000 },
                { name: "Ju", value: 110000 },
                { name: "Vi", value: 116000 },
                { name: "Sá", value: 121000 },
                { name: "Do", value: 128000 },
              ],
            },
          },
          {
            type: "table",
            title: "Por plataforma",
            data: [
              { red: "Instagram", segs: "34.4K", eng: "4.2%" },
              { red: "TikTok", segs: "18.9K", eng: "6.1%" },
              { red: "YouTube", segs: "7.2K", eng: "3.4%" },
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
  const still = new URLSearchParams(window.location.search).has("still");

  const state = demo ?? session.state;
  const { caption, widgets } = demo
    ? demoContent(demo)
    : { caption: session.caption, widgets: session.widgets };

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
