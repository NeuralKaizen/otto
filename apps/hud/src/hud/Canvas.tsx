import type { CSSProperties } from "react";
import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";
import { BannerParticles, type BurstTarget } from "./BannerParticles";
import { BannerLinks, type LinkTarget } from "./BannerLinks";

// ─── Rail placement ─────────────────────────────────────────────────────────
//
// El núcleo vive en (50vw, 50vh). En vez de desperdigar tarjetas en ángulos
// alrededor del anillo (se veía random y contra los bordes), las organizamos
// en DOS RIELES verticales que flanquean el núcleo — como una cabina:
//   · Riel DERECHO: los KPIs, apilados y alineados.
//   · Riel IZQUIERDO: gráficas + tabla, apilados y alineados.
// El núcleo queda despejado en el centro; los haces conectan cada tarjeta.
//
// Cada slot recibe CSS custom properties:
//   --tx / --ty  : desplazamiento desde el centro del núcleo (vmin)
//   --dx / --dy  : vector unitario centro → slot (para la animación de entrada)
// y se coloca con: left/top: calc(50% + var(--tx|--ty) * 1vmin); translate(-50%,-50%).

const RAIL_X = 54;      // vmin — distancia horizontal del centro a cada riel
const KPI_SPAN = 66;    // vmin — alto total ocupado por el riel de KPIs
const LEFT_SPAN = 58;   // vmin — alto total ocupado por el riel izquierdo

// Cadencia narrativa: cada widget entra un beat después del anterior, en el
// orden en que el agente los emitió. Una gráfica reserva más tiempo que un KPI
// para que se le vea crecer las barras antes del siguiente beat.
const BEAT_MS: Record<string, number> = {
  kpi_card: 380,
  metric_chart: 650,
};
const DEFAULT_BEAT_MS = 500;

interface SlotStyle {
  tx: number; // vmin offset X desde el centro (positivo = derecha)
  ty: number; // vmin offset Y desde el centro (positivo = abajo)
  dx: number; // vector unitario X (dirección del reveal)
  dy: number; // vector unitario Y
}

function railSlot(x: number, ty: number): SlotStyle {
  const len = Math.hypot(x, ty) || 1;
  return { tx: x, ty, dx: x / len, dy: ty / len };
}

// n items centrados verticalmente sobre un span dado (devuelve los ty en vmin).
function stackYs(n: number, span: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const step = span / (n - 1);
  return Array.from({ length: n }, (_, i) => -span / 2 + i * step);
}

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  // Repartir por riel: KPIs a la derecha; gráficas y tabla a la izquierda.
  const kpiIdxs: number[] = [];
  const leftIdxs: number[] = [];
  widgets.forEach((w, i) => (w.type === "kpi_card" ? kpiIdxs : leftIdxs).push(i));

  const kpiYs = stackYs(kpiIdxs.length, KPI_SPAN);
  const leftYs = stackYs(leftIdxs.length, LEFT_SPAN);

  const slotByIndex: SlotStyle[] = new Array(widgets.length);
  kpiIdxs.forEach((wi, k) => (slotByIndex[wi] = railSlot(RAIL_X, kpiYs[k])));
  leftIdxs.forEach((wi, k) => (slotByIndex[wi] = railSlot(-RAIL_X, leftYs[k])));

  // Coreografía narrativa: entran en el orden de emisión, un beat cada uno.
  let elapsed = 0;
  const slottedWidgets: Array<{ widget: RenderedWidget; slot: SlotStyle; delay: number }> =
    widgets.map((widget, i) => {
      const slot = slotByIndex[i];
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
