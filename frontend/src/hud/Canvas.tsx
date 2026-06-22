import type { CSSProperties } from "react";
import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";

// ─── Arc placement ──────────────────────────────────────────────────────────
//
// Core center sits at (50 vw, 44 vh).
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
//   top:  calc(44% + var(--ty) * 1vmin)
//   transform: translate(-50%, -50%)   ← centers the card on that anchor point

const CARD_RADIUS   = 47;   // vmin — clear of the outer ring (~41vmin)
const TABLE_RADIUS  = 45;   // vmin — same zone, opposite side

// Angular span for KPI chips (degrees, clockwise from top = 0° = "north")
// We place them on the right arc: 25° … 70° → east-northeast
const KPI_START_DEG = 25;
const KPI_END_DEG   = 70;

// Table anchor angle (left / west side of the ring)
const TABLE_DEG     = 220;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

interface SlotStyle {
  tx: number;   // vmin offset X from center (positive = right)
  ty: number;   // vmin offset Y from center (positive = down)
  dx: number;   // unit vector X (for reveal direction)
  dy: number;   // unit vector Y
}

function kpiSlotStyle(index: number, total: number): SlotStyle {
  // Distribute over the KPI arc, or just use START if only one card
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const deg = KPI_START_DEG + t * (KPI_END_DEG - KPI_START_DEG);
  // CSS angle convention: 0° = top, 90° = right (clockwise)
  // Math convention: angle from positive-X axis, counter-clockwise
  const rad = degToRad(deg);
  const tx = CARD_RADIUS * Math.sin(rad);
  const ty = -CARD_RADIUS * Math.cos(rad);   // negative because Y goes down in screen coords
  const len = Math.sqrt(tx * tx + ty * ty);
  return { tx, ty, dx: tx / len, dy: ty / len };
}

function tableSlotStyle(): SlotStyle {
  const rad = degToRad(TABLE_DEG);
  const tx = TABLE_RADIUS * Math.sin(rad);
  const ty = -TABLE_RADIUS * Math.cos(rad);
  const len = Math.sqrt(tx * tx + ty * ty);
  return { tx, ty, dx: tx / len, dy: ty / len };
}

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  const kpiWidgets = widgets.filter((w) => w.type === "kpi_card");
  const otherWidgets = widgets.filter((w) => w.type !== "kpi_card");

  // Build positional metadata for each widget
  const slottedWidgets: Array<{ widget: RenderedWidget; slot: SlotStyle; delay: number }> = [];

  kpiWidgets.forEach((w, i) => {
    slottedWidgets.push({
      widget: w,
      slot: kpiSlotStyle(i, kpiWidgets.length),
      delay: i * 110,
    });
  });

  otherWidgets.forEach((w, i) => {
    slottedWidgets.push({
      widget: w,
      slot: tableSlotStyle(),
      delay: (kpiWidgets.length + i) * 110,
    });
  });

  return (
    <div className="hud-canvas">
      {slottedWidgets.map(({ widget, slot, delay }, i) => {
        const style = {
          "--tx": `${slot.tx.toFixed(3)}`,
          "--ty": `${slot.ty.toFixed(3)}`,
          "--dx": `${slot.dx.toFixed(3)}`,
          "--dy": `${slot.dy.toFixed(3)}`,
          animationDelay: `${delay}ms`,
        } as CSSProperties;

        return (
          <div
            key={`${widget.type}-${widget.title}-${i}`}
            className="hud-slot"
            style={style}
          >
            {widgetFor(widget)}
          </div>
        );
      })}
    </div>
  );
}
