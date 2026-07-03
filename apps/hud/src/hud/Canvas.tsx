import type { CSSProperties } from "react";
import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";
import { BannerParticles, type BurstTarget } from "./BannerParticles";
import { BannerLinks, type LinkTarget } from "./BannerLinks";

// ─── Arc placement ──────────────────────────────────────────────────────────
//
// Core center sits at (50 vw, 50 vh).
// Outer HUD ring ≈ 0.41 × min(vw,vh) = 41 vmin radius.
// Cards anchor just OUTSIDE that ring at CARD_RADIUS vmin so the core stays clear.
//
// KPI cards:  arc along the right side of the ring (30° … 80° measured clockwise
//             from the top of the circle, i.e. "northeast/east").
// Table:      anchored to the left side (210°) — wider footprint, separate sector.
//
// Each slot receives CSS custom properties:
//   --tx / --ty  : translation from the core center (vmin)
//   --dx / --dy  : unit vector pointing FROM center TO the slot (for the reveal animation)
//
// The slot is then placed with:
//   left: calc(50% + var(--tx) * 1vmin)
//   top:  calc(50% + var(--ty) * 1vmin)
//   transform: translate(-50%, -50%)   ← centers the card on that anchor point

const CARD_RADIUS   = 47;   // vmin — clear of the outer ring (~41vmin)
const TABLE_RADIUS  = 45;   // vmin — same zone, opposite side

// Angular span for KPI chips (degrees, clockwise from top = 0° = "north")
// We place them on the right arc: 25° … 70° → east-northeast
const KPI_START_DEG = 25;
const KPI_END_DEG   = 70;

// Sector de las gráficas: arco oeste, espejo de los KPIs
const CHART_RADIUS    = 47;   // vmin
const CHART_START_DEG = 250;
const CHART_END_DEG   = 305;

// Table anchor angle (sur-suroeste, despejado de las gráficas)
const TABLE_DEG     = 205;

// Cadencia narrativa: cada widget entra un beat después del anterior, en el
// orden en que el agente los emitió. Una gráfica reserva más tiempo que un
// KPI para que se le vea crecer las barras antes del siguiente beat.
const BEAT_MS: Record<string, number> = {
  kpi_card: 380,
  metric_chart: 650,
};
const DEFAULT_BEAT_MS = 500;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

interface SlotStyle {
  tx: number;   // vmin offset X from center (positive = right)
  ty: number;   // vmin offset Y from center (positive = down)
  dx: number;   // unit vector X (for reveal direction)
  dy: number;   // unit vector Y
}

function arcSlotStyle(index: number, total: number, startDeg: number, endDeg: number, radius: number): SlotStyle {
  // Distribute over the arc, or just use its middle if only one card
  const t = total <= 1 ? 0.5 : index / (total - 1);
  // CSS angle convention: 0° = top, 90° = right (clockwise)
  // Math convention: angle from positive-X axis, counter-clockwise
  const rad = degToRad(startDeg + t * (endDeg - startDeg));
  // tx/len = (R·sin(rad))/R = sin(rad); ty/len = (-R·cos(rad))/R = -cos(rad)
  // (ty negative because Y goes down in screen coords)
  return {
    tx: radius * Math.sin(rad),
    ty: -radius * Math.cos(rad),
    dx: Math.sin(rad),
    dy: -Math.cos(rad),
  };
}

function kpiSlotStyle(index: number, total: number): SlotStyle {
  return arcSlotStyle(index, total, KPI_START_DEG, KPI_END_DEG, CARD_RADIUS);
}

function chartSlotStyle(index: number, total: number): SlotStyle {
  return arcSlotStyle(index, total, CHART_START_DEG, CHART_END_DEG, CHART_RADIUS);
}

function tableSlotStyle(): SlotStyle {
  const rad = degToRad(TABLE_DEG);
  const tx = TABLE_RADIUS * Math.sin(rad);
  const ty = -TABLE_RADIUS * Math.cos(rad);
  // tx/len = (R·sin(rad))/R = sin(rad); ty/len = (-R·cos(rad))/R = -cos(rad)
  return { tx, ty, dx: Math.sin(rad), dy: -Math.cos(rad) };
}

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  const kpiCount = widgets.filter((w) => w.type === "kpi_card").length;
  const chartCount = widgets.filter((w) => w.type === "metric_chart").length;

  // Coreografía narrativa: los widgets entran en el orden en que el agente los
  // emitió, cada uno un beat después del anterior; el sector depende del tipo.
  let elapsed = 0;
  let kpiSeen = 0;
  let chartSeen = 0;
  const slottedWidgets: Array<{ widget: RenderedWidget; slot: SlotStyle; delay: number }> =
    widgets.map((widget) => {
      const slot =
        widget.type === "kpi_card"
          ? kpiSlotStyle(kpiSeen++, kpiCount)
          : widget.type === "metric_chart"
          ? chartSlotStyle(chartSeen++, chartCount)
          : tableSlotStyle();
      const delay = elapsed;
      elapsed += BEAT_MS[widget.type] ?? DEFAULT_BEAT_MS;
      return { widget, slot, delay };
    });

  // One particle burst + one connection beam per banner, from the core.
  const targets = slottedWidgets.map(({ widget, slot, delay }, i) => ({
    key: `${widget.type}-${widget.title}-${i}`,
    tx: slot.tx,
    ty: slot.ty,
    delay,
  }));
  const bursts: BurstTarget[] = targets;
  const links: LinkTarget[] = targets;

  return (
    <div className="hud-canvas">
      <BannerLinks links={links} />
      <BannerParticles bursts={bursts} />
      {slottedWidgets.map(({ widget, slot, delay }, i) => {
        const style = {
          "--tx": `${slot.tx.toFixed(3)}`,
          "--ty": `${slot.ty.toFixed(3)}`,
          "--dx": `${slot.dx.toFixed(3)}`,
          "--dy": `${slot.dy.toFixed(3)}`,
          // Stagger compartido: lo consumen tanto el slot (recorrido) como el
          // glow/sweep del widget interno, así toda la tarjeta entra al unísono.
          "--delay": `${delay}ms`,
        } as CSSProperties;

        return (
          <div
            key={`${widget.type}-${widget.title}-${i}`}
            className="hud-slot"
            style={style}
          >
            {widgetFor(widget, delay)}
          </div>
        );
      })}
    </div>
  );
}
