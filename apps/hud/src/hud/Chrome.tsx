import { useEffect, useState } from "react";

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

export function Chrome() {
  return (
    <div className="hud-chrome" aria-hidden="true">
      <span className="frame-corner corner-tl" />
      <span className="frame-corner corner-tr" />
      <span className="frame-corner corner-bl" />
      <span className="frame-corner corner-br" />

      <header className="chrome-top">
        <div className="chrome-brand">
          <span className="brand-mark">WATTSON</span>
          <span className="brand-sub">acelera talent · instancia 0</span>
        </div>
        <div className="chrome-meta">
          <Clock />
        </div>
      </header>
    </div>
  );
}
