import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { scrambleFrame, GLYPH_POOL } from "./scramble";

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
  const [prevText, setPrevText] = useState(text);

  // Reset to the final text when the prop changes (React's sanctioned
  // adjust-state-during-render pattern) so a value change without a remount
  // shows the new text immediately — including under reduced motion, where the
  // effect below returns early and never sets state.
  if (text !== prevText) {
    setPrevText(text);
    setDisplay(text);
  }

  useEffect(() => {
    if (prefersReducedMotion()) return; // display already tracks `text`
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
