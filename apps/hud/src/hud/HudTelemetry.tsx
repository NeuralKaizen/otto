import { useEffect, useRef, useState } from "react";

// ─── Corner telemetry readouts ────────────────────────────────────────────
//
// Decorative HUD chrome — system flavor, NOT business data. Never surface
// invented numbers that could read as real metrics (Otto's "el dato manda"
// rule); these are status flags, honest signals (session uptime), and static
// decorative markers. Fine-print monospace anchored to the corners.

function fmtUptime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function HudTelemetry() {
  const startRef = useRef(0);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hud-telemetry" aria-hidden="true">
      <div className="telemetry-block tele-tr">
        <span className="tele-line">
          <span className="tele-key">SESIÓN</span> ACTIVA
        </span>
        <span className="tele-line">
          <span className="tele-key">LLM</span> CLAUDE · OPUS
        </span>
      </div>

      <div className="telemetry-block tele-bl">
        <span className="tele-line">
          <span className="tele-dot" /> SYS · ONLINE
        </span>
        <span className="tele-line">
          <span className="tele-key">NÚCLEO</span> ESTABLE
        </span>
        <span className="tele-line">
          <span className="tele-key">UPTIME</span> {fmtUptime(uptime)}
        </span>
      </div>

      <div className="telemetry-block tele-br">
        <span className="tele-line">
          <span className="tele-key">LAT</span> −34.603 <span className="tele-key">LON</span> −58.381
        </span>
        <span className="tele-line">
          <span className="tele-key">LINK</span> ▮▮▮▮▯
        </span>
        <span className="tele-scan" />
      </div>
    </div>
  );
}
