import { useEffect, useState } from "react";
import type { SessionState } from "../voice/types";

const LABEL: Record<SessionState, string> = {
  idle: "en reposo",
  listening: "escuchando",
  processing: "pensando",
  speaking: "hablando",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="chrome-clock">
      {now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export function Chrome({ state, voiceOk = true }: { state: SessionState; voiceOk?: boolean }) {
  return (
    <div className="hud-chrome" aria-hidden="true">
      <span className="frame-corner corner-tl" />
      <span className="frame-corner corner-tr" />
      <span className="frame-corner corner-bl" />
      <span className="frame-corner corner-br" />

      <header className="chrome-top">
        <div className="chrome-brand">
          <span className="brand-mark">OTTO</span>
          <span className="brand-sub">acelera talent · instancia 0</span>
        </div>
        <div className="chrome-state">
          <span className="state-dot" />
          <span className="state-label">{LABEL[state]}</span>
        </div>
        <div className="chrome-meta">
          {!voiceOk && <span className="meta-novoice">sin voz · abrí en chrome</span>}
          <span className="meta-hint">espacio · demo</span>
          <span className="meta-demo">datos de demostración</span>
          <Clock />
        </div>
      </header>
    </div>
  );
}
