import { useEffect, useState } from "react";
import type { SessionState } from "../voice/types";

const LABEL: Record<SessionState, string> = {
  idle: "en reposo",
  listening: "escuchando",
  processing: "pensando",
  speaking: "hablando",
};

const HINT: Record<SessionState, string> = {
  idle: "decí «otto» para activarme",
  listening: "sesión abierta — hablá libre",
  processing: "consultando el cerebro",
  speaking: "narrando — hablá para interrumpir",
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

// Barras decorativas tipo espectro; el ritmo lo maneja CSS por estado.
const BARS = Array.from({ length: 22 }, (_, i) => i);

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
          <span className="meta-demo">datos de demostración</span>
          <Clock />
        </div>
      </header>

      <div className="chrome-readout">
        <div className="readout-row">
          <span className="readout-key">estado</span>
          <span className="readout-val">{LABEL[state]}</span>
        </div>
        <div className="readout-row">
          <span className="readout-key">mic</span>
          <span className="readout-val">
            {voiceOk ? (state === "idle" ? "standby" : "abierto") : "sin soporte"}
          </span>
        </div>
        <div className="readout-row">
          <span className="readout-key">cerebro</span>
          <span className="readout-val">claude · api</span>
        </div>
        <div className="readout-hint">
          {voiceOk ? HINT[state] : "este navegador no soporta voz — abrí en chrome o edge"}
        </div>
      </div>

      <div className="chrome-spectrum">
        {BARS.map((i) => (
          <span
            key={i}
            className="spectrum-bar"
            style={{
              animationDelay: `${(i * 137) % 900}ms`,
              animationDuration: `${700 + ((i * 263) % 600)}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
