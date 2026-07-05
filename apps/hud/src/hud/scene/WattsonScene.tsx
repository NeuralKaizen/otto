import { useEffect, useRef } from "react";
import type { SessionState } from "../../voice/types";
import { WattsonGLEngine } from "./glengine";

// Escena WebGL2 full-viewport. `getAmplitude` entrega la amplitud real de
// voz (mic via Web Audio) sin provocar re-renders; el motor la mezcla con
// su envolvente ambiente.
export function WattsonScene({
  state,
  getAmplitude,
}: {
  state: SessionState;
  getAmplitude?: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WattsonGLEngine | null>(null);
  const ampRef = useRef<(() => number) | undefined>(undefined);

  useEffect(() => {
    ampRef.current = getAmplitude;
  }, [getAmplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
    });
    if (!gl) return; // jsdom / GPU vetada: la escena se apaga sola

    let engine: WattsonGLEngine;
    try {
      engine = new WattsonGLEngine(gl);
    } catch {
      return; // shader no compiló en este driver: no tumbar la app
    }
    engineRef.current = engine;
    if (import.meta.env.DEV) {
      (window as unknown as { __wattsonEngine?: WattsonGLEngine }).__wattsonEngine = engine;
    }

    const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    const syncMotion = () => { engine.reducedMotion = media?.matches ?? false; };
    syncMotion();
    media?.addEventListener?.("change", syncMotion);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      engine.resize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    document.fonts?.ready?.then(() => {
      if (engineRef.current === engine) resize();
    });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      engine.frame(dt, now / 1000, ampRef.current?.() ?? 0);
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

  return <canvas ref={canvasRef} className="wattson-scene" aria-hidden="true" />;
}
