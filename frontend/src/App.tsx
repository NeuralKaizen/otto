import { useMemo } from "react";
import type { SessionState, RenderedWidget } from "./voice/types";
import { useSession } from "./voice/useSession";
import {
  WebSpeechWakeWord,
  WebSpeechTranscriber,
  speechRecognitionSupported,
} from "./voice/adapters/webSpeech";
import { SpeechSynthesisSpeaker } from "./voice/adapters/speechSynthesis";
import { callConverse } from "./api/converse";
import { OttoScene } from "./hud/scene/OttoScene";
import { Chrome } from "./hud/Chrome";
import { Captions } from "./hud/Captions";
import { Canvas } from "./hud/Canvas";
import "./App.css";

// Modo vitrina para diseño/QA: ?hud=idle|listening|processing|speaking
// fuerza el estado visual con contenido demo, sin micrófono de por medio.
const SHOWCASE_STATES: SessionState[] = ["idle", "listening", "processing", "speaking"];

function useShowcase(): { state: SessionState; caption: string; widgets: RenderedWidget[] } | null {
  return useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("hud");
    const state = SHOWCASE_STATES.find((s) => s === value);
    if (!state) return null;
    return {
      state,
      caption:
        state === "speaking"
          ? "Tenés doce tareas activas y tres atrasadas. Persona B concentra la mayor carga."
          : state === "listening"
            ? "¿cómo viene el equipo hoy?"
            : "",
      widgets:
        state === "speaking"
          ? [
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
            ]
          : [],
    };
  }, []);
}

export default function App() {
  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new SpeechSynthesisSpeaker(),
    converse: (text: string) => callConverse(text),
    closingPhrase: "listo",
    silenceMs: 35000,
  }), []);

  const session = useSession(deps);
  const showcase = useShowcase();
  const state = showcase?.state ?? session.state;
  const caption = showcase?.caption ?? session.caption;
  const widgets = showcase?.widgets ?? session.widgets;

  return (
    <div className="hud" data-state={state}>
      <OttoScene state={state} />
      <div className="hud-vignette" aria-hidden="true" />
      <div className="hud-grain" aria-hidden="true" />
      <Chrome state={state} voiceOk={speechRecognitionSupported} />
      <main className="hud-stage">
        <Canvas widgets={widgets} />
        <Captions text={caption} />
      </main>
    </div>
  );
}
