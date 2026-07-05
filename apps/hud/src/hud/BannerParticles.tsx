import { useEffect, useRef } from "react";

// ─── Banner particle burst ────────────────────────────────────────────────
//
// When a banner appears, a swarm of particles is fired FROM the core center
// (50vw, 50vh) OUT toward the banner's slot, arriving as the card materializes
// and bursting on impact. This ties each banner to Wattson's core.
//
// Rendered as one transparent full-viewport <canvas> sitting above the WebGL
// scene and below the cards (first child of .hud-canvas). One rAF loop drives
// all bursts; it self-cancels when no particles are alive, so nothing runs at
// rest. Honors prefers-reduced-motion (renders nothing).

export interface BurstTarget {
  key: string; // stable per banner identity — re-appearing re-fires the burst
  tx: number; // vmin offset X from core center (same value Canvas.tsx injects)
  ty: number; // vmin offset Y from core center
  delay: number; // ms — shares the card's stagger delay
}

interface Particle {
  sx: number; // start (core center, px)
  sy: number;
  tx: number; // target (banner slot, px)
  ty: number;
  vx: number; // burst velocity after arrival (px/s)
  vy: number;
  start: number; // ms (perf clock) when this particle begins moving
  travel: number; // ms to reach the target
  burst: number; // ms of scatter-and-fade after arrival
  size: number;
  px: number; // previous frame position (for the comet streak)
  py: number;
  color: string;
}

const FALLBACK_ACCENT = "#28C8B4";
const PER_BURST = 40;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function BannerParticles({ bursts }: { bursts: BurstTarget[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const dprRef = useRef(1);

  // Keep the canvas backing store sized to the viewport (DPR-aware).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Spawn a burst whenever a new banner key shows up. Pruning keys that are no
  // longer present means a banner that leaves and returns re-fires.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / unsupported — no-op

    const present = new Set(bursts.map((b) => b.key));
    for (const key of seenRef.current) {
      if (!present.has(key)) seenRef.current.delete(key);
    }

    const now = performance.now();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    const accent =
      getComputedStyle(canvas).getPropertyValue("--accent").trim() || FALLBACK_ACCENT;

    let spawnedAny = false;
    for (const b of bursts) {
      if (seenRef.current.has(b.key)) continue;
      seenRef.current.add(b.key);
      spawnedAny = true;

      const anchorX = cx + b.tx * vmin;
      const anchorY = cy + b.ty * vmin;
      for (let i = 0; i < PER_BURST; i++) {
        // scatter the target across the card footprint
        const tx = anchorX + (Math.random() - 0.5) * 150;
        const ty = anchorY + (Math.random() - 0.5) * 70;
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 130;
        particlesRef.current.push({
          sx: cx + (Math.random() - 0.5) * 20,
          sy: cy + (Math.random() - 0.5) * 20,
          tx,
          ty,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          start: now + b.delay + Math.random() * 140,
          travel: 360 + Math.random() * 220,
          burst: 260 + Math.random() * 240,
          size: 1 + Math.random() * 1.8,
          px: cx,
          py: cy,
          color: accent,
        });
      }
    }

    if (spawnedAny && !runningRef.current) {
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(frame);
    }

    function frame(ts: number) {
      const c = canvasRef.current;
      const context = c?.getContext("2d");
      if (!c || !context) {
        runningRef.current = false;
        return;
      }
      const dpr = dprRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, c.width, c.height);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";

      const live: Particle[] = [];
      for (const p of particlesRef.current) {
        const t = ts - p.start;
        if (t < 0) {
          live.push(p);
          continue;
        }
        let x: number;
        let y: number;
        let alpha: number;
        if (t < p.travel) {
          const e = easeOutCubic(t / p.travel);
          x = p.sx + (p.tx - p.sx) * e;
          y = p.sy + (p.ty - p.sy) * e;
          alpha = Math.min(1, (t / p.travel) * 3); // quick fade-in
        } else if (t < p.travel + p.burst) {
          const bt = (t - p.travel) / 1000;
          x = p.tx + p.vx * bt;
          y = p.ty + p.vy * bt;
          alpha = 1 - (t - p.travel) / p.burst; // fade out on scatter
        } else {
          continue; // dead
        }

        context.globalAlpha = alpha;
        context.strokeStyle = p.color;
        context.lineWidth = p.size;
        context.beginPath();
        context.moveTo(p.px, p.py);
        context.lineTo(x, y);
        context.stroke();
        // bright head
        context.globalAlpha = alpha;
        context.fillStyle = p.color;
        context.beginPath();
        context.arc(x, y, p.size * 0.9, 0, Math.PI * 2);
        context.fill();

        p.px = x;
        p.py = y;
        live.push(p);
      }
      particlesRef.current = live;

      if (live.length > 0) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        context.globalAlpha = 1;
        context.clearRect(0, 0, c.width, c.height);
        runningRef.current = false;
      }
    }
  }, [bursts]);

  // Cancel the loop on unmount.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="banner-particles" aria-hidden="true" />;
}
