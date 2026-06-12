import { useEffect, useRef } from "react";
import type { SessionState } from "../../voice/types";
import { OttoEngine } from "./engine";

// Escena full-viewport del panel: un canvas, un motor, cero re-renders por
// frame. `amplitude` queda como entrada para la amplitud real (mic/TTS);
// mientras tanto el motor genera su propia envolvente ambiente.
export function OttoScene({ state, amplitude = 0 }: { state: SessionState; amplitude?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OttoEngine | null>(null);
  const ampRef = useRef(0);

  useEffect(() => {
    ampRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / entorno sin canvas: la escena se apaga sola

    const engine = new OttoEngine();
    engineRef.current = engine;
    if (import.meta.env.DEV) {
      (window as unknown as { __ottoEngine?: OttoEngine }).__ottoEngine = engine;
    }

    const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    const syncMotion = () => { engine.reducedMotion = media?.matches ?? false; };
    syncMotion();
    media?.addEventListener?.("change", syncMotion);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.resize(window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    // El wordmark se muestrea con la fuente display; re-muestrear al cargarla
    document.fonts?.ready?.then(() => engine.resize(window.innerWidth, window.innerHeight));

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      engine.frame(ctx, dt, now / 1000, ampRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      media?.removeEventListener?.("change", syncMotion);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setMode(state);
  }, [state]);

  return <canvas ref={canvasRef} className="otto-scene" aria-hidden="true" />;
}
