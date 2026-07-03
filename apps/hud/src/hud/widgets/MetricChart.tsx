import { DecryptText } from "../DecryptText";
import { formatCompact } from "./format";
import type { MetricChartData } from "../../api/metricsWidgets";

// Coreografía interna de la tarjeta, relativa al --delay del slot:
// 1) la tarjeta materializa (widget-materialize ~0.85s),
// 2) el título/total se descifran (DECRYPT_LEAD, igual que KpiCard),
// 3) las barras crecen una a una (BARS_LEAD + i·BAR_STAGGER).
const DECRYPT_LEAD = 420;
const DECRYPT_DURATION = 1000;
const BARS_LEAD = 520;
const BAR_STAGGER = 110;

// Geometría del SVG (viewBox fijo; escala con la tarjeta vía width:100%)
const VB_W = 240;
const VB_H = 116;
const PLOT_X = 8;
const PLOT_W = VB_W - PLOT_X * 2;
const BASELINE_Y = 92;
const MAX_BAR_H = 62;
const LABEL_Y = 106;

function parseData(data: unknown): MetricChartData | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as { points?: unknown; unit?: unknown; subtitle?: unknown };
  if (!Array.isArray(d.points)) return null;
  const points = d.points.filter(
    (p): p is { name: string; value: number } =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { name?: unknown }).name === "string" &&
      typeof (p as { value?: unknown }).value === "number",
  );
  if (points.length === 0) return null;
  return {
    points,
    unit: typeof d.unit === "string" ? d.unit : undefined,
    subtitle: typeof d.subtitle === "string" ? d.subtitle : undefined,
  };
}

export function MetricChart({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const parsed = parseData(data);

  if (!parsed) {
    return (
      <div className="widget metric-chart">
        <div className="widget-title">{title}</div>
        <div className="widget-empty">sin datos</div>
      </div>
    );
  }

  const { points, unit, subtitle } = parsed;
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = Math.max(...points.map((p) => p.value));
  const slotW = PLOT_W / points.length;
  const barW = Math.min(34, slotW * 0.55);

  return (
    <div className="widget metric-chart">
      <div className="mc-head">
        <div>
          <div className="widget-title">
            <DecryptText text={title} startDelay={delay + DECRYPT_LEAD} duration={DECRYPT_DURATION} />
          </div>
          {subtitle && <div className="mc-sub">{subtitle}</div>}
        </div>
        <div className="mc-total">
          <DecryptText
            text={formatCompact(total)}
            startDelay={delay + DECRYPT_LEAD}
            duration={DECRYPT_DURATION}
          />
          {unit && <span className="mc-unit">{unit}</span>}
        </div>
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={title}>
        {/* gridlines tenues + línea base */}
        <line
          className="mc-grid"
          x1={PLOT_X}
          x2={VB_W - PLOT_X}
          y1={BASELINE_Y - MAX_BAR_H * (2 / 3)}
          y2={BASELINE_Y - MAX_BAR_H * (2 / 3)}
        />
        <line
          className="mc-grid"
          x1={PLOT_X}
          x2={VB_W - PLOT_X}
          y1={BASELINE_Y - MAX_BAR_H / 3}
          y2={BASELINE_Y - MAX_BAR_H / 3}
        />
        <line className="mc-base" x1={PLOT_X} x2={VB_W - PLOT_X} y1={BASELINE_Y} y2={BASELINE_Y} />

        {points.map((p, i) => {
          const h = max > 0 ? Math.max(2, (p.value / max) * MAX_BAR_H) : 2;
          const cx = PLOT_X + slotW * i + slotW / 2;
          const x = cx - barW / 2;
          const y = BASELINE_Y - h;
          const barDelay = `${delay + BARS_LEAD + i * BAR_STAGGER}ms`;
          return (
            <g key={`${p.name}-${i}`}>
              {/* la barra crece desde la base; cap superior más brillante */}
              <g className="mc-bar" style={{ animationDelay: barDelay }}>
                <rect className="mc-bar-fill" x={x} y={y} width={barW} height={h} rx={1.5} />
                <rect className="mc-bar-cap" x={x} y={y} width={barW} height={2} />
              </g>
              <text className="mc-val" x={cx} y={y - 5} textAnchor="middle" style={{ animationDelay: barDelay }}>
                {formatCompact(p.value)}
              </text>
              <text className="mc-label" x={cx} y={LABEL_Y} textAnchor="middle" style={{ animationDelay: barDelay }}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
