// ─── Orbital ring system ──────────────────────────────────────────────────
//
// A crisp vector "Jarvis" ring assembly centered on the core: concentric
// circles (some dashed), a radial tick gauge, and two gyroscopic atom-orbits
// each carrying a traveling node. Pure SVG + CSS rotations — cheap, GPU-driven,
// paused under prefers-reduced-motion (see App.css). Sits above the WebGL scene
// and below the banners.

const C = 100; // viewBox center (viewBox is 0 0 200 200)

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const long = i % 6 === 0;
  const r1 = long ? 80 : 85;
  const r2 = 90;
  return {
    x1: C + Math.cos(a) * r1,
    y1: C + Math.sin(a) * r1,
    x2: C + Math.cos(a) * r2,
    y2: C + Math.sin(a) * r2,
    long,
  };
});

export function OrbitalRings() {
  return (
    <div className="orbital-rings" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        {/* concentric rings */}
        <circle className="oring oring-a" cx={C} cy={C} r={42} />
        <circle className="oring oring-b" cx={C} cy={C} r={60} />
        <circle className="oring oring-c" cx={C} cy={C} r={74} />

        {/* radial tick gauge */}
        <g className="oring tick-ring">
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              className={t.long ? "otick otick-long" : "otick"}
            />
          ))}
        </g>

        {/* gyroscopic atom-orbits, each with a traveling node */}
        <g className="orbit-grp orbit-1">
          <ellipse className="orbit-path" cx={C} cy={C} rx={90} ry={32} />
          <circle className="orbit-node" cx={C + 90} cy={C} r={2.6} />
        </g>
        <g className="orbit-grp orbit-2">
          <ellipse className="orbit-path" cx={C} cy={C} rx={90} ry={32} />
          <circle className="orbit-node" cx={C + 90} cy={C} r={2.2} />
        </g>
      </svg>
    </div>
  );
}
