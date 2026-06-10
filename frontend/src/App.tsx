import { useMemo } from "react";
import { useSession } from "./voice/useSession";
import { WebSpeechWakeWord, WebSpeechTranscriber } from "./voice/adapters/webSpeech";
import { SpeechSynthesisSpeaker } from "./voice/adapters/speechSynthesis";
import { callConverse } from "./api/converse";
import { Core } from "./hud/Core";
import { Captions } from "./hud/Captions";
import { Canvas } from "./hud/Canvas";
import "./App.css";

export default function App() {
  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new SpeechSynthesisSpeaker(),
    converse: (text: string) => callConverse(text),
    closingPhrase: "listo",
    silenceMs: 35000,
  }), []);

  const { state, caption, widgets } = useSession(deps);

  return (
    <div className="hud">
      <Core state={state} amplitude={state === "listening" || state === "speaking" ? 0.5 : 0} />
      <Canvas widgets={widgets} />
      <Captions text={caption} />
    </div>
  );
}
