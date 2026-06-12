import { useCallback, useEffect, useRef } from "react";

// Nivel RMS del micrófono via Web Audio, expuesto como getter (sin
// re-renders a 60fps). Activo solo cuando la sesión escucha/habla;
// si no hay permiso o falla, devuelve 0 y la escena usa su envolvente.
export function useMicLevel(active: boolean): () => number {
  const levelRef = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      levelRef.current = 0;
      return;
    }
    let alive = true;
    let raf = 0;
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          // ganancia + suavizado asimétrico (ataque rápido, caída lenta)
          const level = Math.min(1, rms * 5.5);
          levelRef.current = level > levelRef.current
            ? level
            : levelRef.current * 0.92 + level * 0.08;
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        /* sin permiso de mic: la escena vive con su envolvente ambiente */
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      audioCtx?.close().catch(() => undefined);
      stream?.getTracks().forEach((tr) => tr.stop());
      levelRef.current = 0;
    };
  }, [active]);

  return useCallback(() => levelRef.current, []);
}
