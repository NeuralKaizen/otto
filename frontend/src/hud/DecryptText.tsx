import { useEffect, useState } from "react";
import type { ReactElement } from "react";

// Glyph pool for the decrypt scramble: katakana + latin + digits + symbols.
// The katakana gives the "terminal desencriptando" texture; latin/digits keep
// numbers legible mid-scramble; symbols add sci-fi noise.
export const GLYPH_POOL =
  "アイウエオカキクケコサシスセソタチツテトﾊﾋﾌﾍﾎ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#%&$@*<>/=+";

// Pure, deterministic scramble frame.
// - Characters before the resolve frontier (floor(progress*len)) show final text.
// - Spaces are always preserved (keeps word shapes readable).
// - Everything else shows a glyph chosen deterministically from `pool` using the
//   character index and the frame `tick`, so the same args always yield the same
//   string (testable) while advancing ticks animate the noise.
export function scrambleFrame(
  text: string,
  progress: number,
  pool: string,
  tick: number,
): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const locked = Math.floor(clamped * text.length);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i < locked || ch === " ") {
      out += ch;
      continue;
    }
    const idx = (i * 31 + tick * 17) % pool.length;
    out += pool[idx];
  }
  return out;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

// Renders `text`, then scrambles → resolves via requestAnimationFrame.
// Initial state is the FINAL text so synchronous tests (and the invisible
// entrance frames) never show garbage; the scramble only begins once the rAF
// loop runs in the browser.
export function DecryptText({
  text,
  startDelay = 0,
  duration = 800,
}: {
  text: string;
  startDelay?: number;
  duration?: number;
}): ReactElement {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text);
      return;
    }
    let raf = 0;
    let start = 0;
    let tick = 0;
    let cancelled = false;

    const step = (ts: number) => {
      if (cancelled) return;
      if (start === 0) start = ts;
      const elapsed = ts - start;
      if (elapsed < startDelay) {
        raf = requestAnimationFrame(step);
        return;
      }
      const progress = Math.min(1, (elapsed - startDelay) / duration);
      tick += 1;
      setDisplay(scrambleFrame(text, progress, GLYPH_POOL, tick));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setDisplay(text); // guarantee the exact final value
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [text, startDelay, duration]);

  return <>{display}</>;
}
