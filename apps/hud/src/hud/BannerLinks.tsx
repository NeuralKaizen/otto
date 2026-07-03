import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

// ─── Core → banner connection beams ───────────────────────────────────────
//
// A thin data-beam links the core center to each banner slot, with flowing
// dashes (circuit/telemetry feel) that fade in on the banner's stagger delay.
// Reinforces that the banners "emit" from Wattson's core. Viewport-sized SVG so
// endpoints land in real pixels; recomputed on resize. Sits below the banners.

export interface LinkTarget {
  key: string;
  tx: number; // vmin offset X from core center (Canvas.tsx slot value)
  ty: number; // vmin offset Y from core center
  delay: number; // ms — the banner's stagger delay
}

export function BannerLinks({ links }: { links: LinkTarget[] }) {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { w, h } = size;
  if (w === 0 || h === 0) return null;
  const cx = w / 2;
  const cy = h / 2;
  const vmin = Math.min(w, h) / 100;

  return (
    <svg className="banner-links" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {links.map((l) => {
        const x2 = cx + l.tx * vmin;
        const y2 = cy + l.ty * vmin;
        return (
          <g key={l.key} className="blink" style={{ "--delay": `${l.delay + 150}ms` } as CSSProperties}>
            <line className="blink-line" x1={cx} y1={cy} x2={x2} y2={y2} />
            <circle className="blink-tip" cx={x2} cy={y2} r={2.6} />
          </g>
        );
      })}
    </svg>
  );
}
