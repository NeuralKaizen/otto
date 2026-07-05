import { DecryptText } from "../DecryptText";

// El descifrado arranca DESPUÉS de que la tarjeta aterriza (slot-emerge ~0.9s),
// así se ve resolver el dato sobre la tarjeta ya visible en vez de mientras aún
// está apareciendo. Un poco más largo para que se lea.
const DECRYPT_LEAD = 420;
const DECRYPT_DURATION = 1000;

// Sparkline compacto: normaliza los puntos a un viewBox chico y traza la línea.
function Sparkline({ points }: { points: number[] }) {
  const W = 66;
  const H = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(" ");
  const lastX = (points.length - 1) * step;
  const lastY = H - ((points[points.length - 1] - min) / span) * H;
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="kpi-spark-line" d={d} fill="none" />
      <circle className="kpi-spark-dot" cx={lastX} cy={lastY} r={1.6} />
    </svg>
  );
}

export function KpiCard({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const d = data as { value?: number | string; delta?: string; spark?: number[] } | null;
  const value = d?.value;
  const delta = d?.delta;
  const spark = Array.isArray(d?.spark) ? d!.spark! : null;
  const dir = typeof delta === "string" && delta.trim().startsWith("-") ? "down" : "up";

  return (
    <div className="widget kpi-card">
      <div className="widget-title">
        <DecryptText text={title} startDelay={delay + DECRYPT_LEAD} duration={DECRYPT_DURATION} />
      </div>
      {value == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">
          <DecryptText
            text={String(value)}
            startDelay={delay + DECRYPT_LEAD}
            duration={DECRYPT_DURATION}
          />
        </div>
      )}
      {(delta || spark) && (
        <div className="kpi-foot">
          {spark && <Sparkline points={spark} />}
          {delta && (
            <span className="kpi-delta" data-dir={dir}>
              {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
