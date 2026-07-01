# HUD Banner Cinematic Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Otto's HUD info-banners (KPI cards + tables) a theatrical, holographic entrance — the card materializes with projector flicker + converging RGB split + micro-jitter, while every text decrypts (scramble → final value).

**Architecture:** Two new layers on top of the existing `slot-emerge` travel-from-core spring: (1) a pure-CSS `widget-materialize` keyframe on `.widget` (replaces `widget-land`) plus a `text-fringe` glow on text nodes; (2) a small self-contained `DecryptText` React component driven by `requestAnimationFrame`, whose scramble logic is a pure, deterministic function. No exit animation, no resting-life, no WebGL changes.

**Tech Stack:** React 19 + plain CSS (no animation libraries). Vite + TypeScript. Vitest + @testing-library/react + jsdom for tests.

## Global Constraints

- **Zero new dependencies.** Frontend deps are only `react` + `react-dom`. Do not add any animation library.
- **Existing tests must stay green.** In particular `frontend/src/hud/widgets/registry.test.tsx` asserts `getByText("Atrasadas")` and `getByText("3")` **synchronously at mount**. Therefore `DecryptText` MUST render its final `text` on initial render and only begin scrambling from a `requestAnimationFrame` scheduled in an effect (testing-library does not advance rAF, so the DOM stays at the final text during tests).
- **The data always wins.** The scramble is cosmetic; the animation MUST always resolve to the exact final `text`. Never let a scrambled value be the terminal state.
- **Respect `prefers-reduced-motion: reduce`.** Under reduced motion: no `widget-materialize`, no `text-fringe`, and `DecryptText` paints the final text immediately.
- **CSS accent tokens:** reuse existing `--accent`, `--accent-soft`, `--accent-line` (keyed to `.hud[data-state]`) — do not hardcode state colors. RGB-split fringe colors (`rgba(255,0,90,…)` magenta / `rgba(0,200,255,…)` cyan) are intentional constants for the chromatic-aberration look.
- **Test command:** run from the `frontend/` directory: `cd frontend && npx vitest run <path>`. Build check: `cd frontend && npm run build` (runs `tsc -b && vite build`).
- **Stagger:** `Canvas.tsx` already computes a per-widget `delay` (number, ms = `index * 130`) and injects `--delay: <delay>ms` on `.hud-slot`. Thread that same number into `DecryptText` as `startDelay`.

---

### Task 1: `scrambleFrame` — pure, deterministic scramble function

**Files:**
- Create: `frontend/src/hud/DecryptText.tsx` (function + `GLYPH_POOL` export only in this task)
- Test: `frontend/src/hud/DecryptText.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const GLYPH_POOL: string` — the character pool used for scrambling.
  - `export function scrambleFrame(text: string, progress: number, pool: string, tick: number): string` — given the final `text`, a `progress` in `[0,1]`, a glyph `pool`, and a frame `tick`, returns a same-length string where the first `floor(progress*len)` characters equal `text`, spaces are preserved, and every other position shows a deterministic glyph from `pool`. `progress >= 1` returns `text` exactly.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hud/DecryptText.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { scrambleFrame, GLYPH_POOL } from "./DecryptText";

describe("scrambleFrame", () => {
  it("progress 1 resolves to the exact final text", () => {
    expect(scrambleFrame("42 tareas", 1, GLYPH_POOL, 0)).toBe("42 tareas");
  });

  it("preserves length and spaces at progress 0", () => {
    const out = scrambleFrame("a b", 0, GLYPH_POOL, 3);
    expect(out).toHaveLength(3);
    expect(out[1]).toBe(" ");
  });

  it("every scrambled (non-space) char comes from the pool", () => {
    const out = scrambleFrame("HELLO", 0, GLYPH_POOL, 7);
    for (const ch of out) {
      expect(GLYPH_POOL.includes(ch)).toBe(true);
    }
  });

  it("locks a left-to-right prefix as progress advances", () => {
    const out = scrambleFrame("abcd", 0.5, GLYPH_POOL, 1);
    expect(out.slice(0, 2)).toBe("ab");
  });

  it("is deterministic for the same arguments", () => {
    expect(scrambleFrame("otto", 0.25, GLYPH_POOL, 9)).toBe(
      scrambleFrame("otto", 0.25, GLYPH_POOL, 9),
    );
  });

  it("clamps out-of-range progress", () => {
    expect(scrambleFrame("xy", 2, GLYPH_POOL, 0)).toBe("xy");
    expect(scrambleFrame("xy", -1, GLYPH_POOL, 0)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hud/DecryptText.test.tsx`
Expected: FAIL — `scrambleFrame`/`GLYPH_POOL` not exported (module has no such export / file missing).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/hud/DecryptText.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hud/DecryptText.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hud/DecryptText.tsx frontend/src/hud/DecryptText.test.tsx
git commit -m "feat(hud): scrambleFrame — función pura del descifrado de banners"
```

---

### Task 2: `DecryptText` component

**Files:**
- Modify: `frontend/src/hud/DecryptText.tsx` (add the component below the pure function)
- Test: `frontend/src/hud/DecryptText.test.tsx` (append a `describe` block)

**Interfaces:**
- Consumes: `scrambleFrame`, `GLYPH_POOL` from Task 1.
- Produces:
  - `export function DecryptText(props: { text: string; startDelay?: number; duration?: number }): ReactElement` — renders `text` on initial mount (so synchronous tests see the final value), then, from a `requestAnimationFrame` loop started in an effect, waits `startDelay` ms and scrambles → resolves over `duration` ms (default 800), ending on the exact `text`. Under `prefers-reduced-motion: reduce`, renders `text` with no animation. Cancels its rAF on unmount.

- [ ] **Step 1: Write the failing test**

First, add these imports to the TOP of `frontend/src/hud/DecryptText.test.tsx` (merge with the existing top-of-file imports — do not place `import` statements mid-file, ESLint `import/first` forbids it). Update the vitest import line and add the two new lines:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { scrambleFrame, GLYPH_POOL, DecryptText } from "./DecryptText";
```

(Replace the Task 1 imports — `import { describe, it, expect } from "vitest";` and `import { scrambleFrame, GLYPH_POOL } from "./DecryptText";` — with the three lines above.)

Then append this block to the bottom of the file:

```tsx
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DecryptText component", () => {
  it("renders the final text on initial mount (synchronous)", () => {
    render(<DecryptText text="Atrasadas" startDelay={0} />);
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
  });

  it("renders final text immediately under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    );
    render(<DecryptText text="123" startDelay={0} />);
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("cancels its animation frame on unmount", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(<DecryptText text="otto" startDelay={0} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hud/DecryptText.test.tsx`
Expected: FAIL — `DecryptText` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Add these imports at the top of `frontend/src/hud/DecryptText.tsx` (above `GLYPH_POOL`):

```tsx
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
```

Append the component to the bottom of `frontend/src/hud/DecryptText.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hud/DecryptText.test.tsx`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hud/DecryptText.tsx frontend/src/hud/DecryptText.test.tsx
git commit -m "feat(hud): componente DecryptText — descifrado por rAF con reduced-motion"
```

---

### Task 3: Wire `delay` through the registry and decrypt every widget text

**Files:**
- Modify: `frontend/src/hud/widgets/registry.tsx`
- Modify: `frontend/src/hud/widgets/KpiCard.tsx`
- Modify: `frontend/src/hud/widgets/TableWidget.tsx`
- Modify: `frontend/src/hud/Canvas.tsx:109`
- Test: `frontend/src/hud/widgets/registry.test.tsx` (extend)

**Interfaces:**
- Consumes: `DecryptText` from Task 2; `widgetFor` gains an optional `delay`.
- Produces:
  - `widgetFor(w: RenderedWidget, delay?: number): ReactElement` — `delay` defaults to `0` so existing single-arg callers keep working.
  - `KpiCard({ title, data, delay }: { title: string; data: unknown; delay?: number })`.
  - `TableWidget({ title, data, delay }: { title: string; data: unknown; delay?: number })`.

- [ ] **Step 1: Write the failing test**

Extend `frontend/src/hud/widgets/registry.test.tsx` — append inside the existing `describe("widget registry", …)` block (before its closing `});`):

```tsx
  it("kpi_card acepta delay y sigue mostrando título y valor finales", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: { value: 3 } }, 260);
    render(<>{el}</>);
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("table renderiza headers y celdas finales con delay", () => {
    const el = widgetFor(
      { type: "table", title: "Equipo", data: [{ persona: "Ana", tareas: 5 }] },
      130,
    );
    render(<>{el}</>);
    expect(screen.getByText("persona")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hud/widgets/registry.test.tsx`
Expected: FAIL — `widgetFor` takes one arg / TableWidget currently shows cells but the new `table` assertions run before wiring is confirmed; primary failure is the type error on the 2nd `widgetFor` argument (TypeScript) or the delay not being accepted.

- [ ] **Step 3: Write minimal implementation**

Replace `frontend/src/hud/widgets/registry.tsx` entirely with:

```tsx
import type { ReactElement } from "react";
import type { RenderedWidget } from "../../voice/types";
import { KpiCard } from "./KpiCard";
import { TableWidget } from "./TableWidget";

type Renderer = (w: RenderedWidget, delay: number) => ReactElement;

const REGISTRY: Record<string, Renderer> = {
  kpi_card: (w, delay) => <KpiCard title={w.title} data={w.data} delay={delay} />,
  table: (w, delay) => <TableWidget title={w.title} data={w.data} delay={delay} />,
};

export function widgetFor(w: RenderedWidget, delay = 0): ReactElement {
  const renderer = REGISTRY[w.type];
  if (!renderer) {
    return <div className="widget widget-unknown">sin renderer para "{w.type}"</div>;
  }
  return renderer(w, delay);
}
```

Replace `frontend/src/hud/widgets/KpiCard.tsx` entirely with:

```tsx
import { DecryptText } from "../DecryptText";

export function KpiCard({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const value = (data as { value?: number } | null)?.value;
  return (
    <div className="widget kpi-card">
      <div className="widget-title">
        <DecryptText text={title} startDelay={delay} />
      </div>
      {data == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">
          <DecryptText text={String(value)} startDelay={delay} />
        </div>
      )}
    </div>
  );
}
```

Replace `frontend/src/hud/widgets/TableWidget.tsx` entirely with:

```tsx
import { DecryptText } from "../DecryptText";

export function TableWidget({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  return (
    <div className="widget table-widget">
      <div className="widget-title">
        <DecryptText text={title} startDelay={delay} />
      </div>
      {rows == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <table>
          <thead>
            <tr>
              {Object.keys(rows[0] ?? {}).map((k) => (
                <th key={k}>
                  <DecryptText text={k} startDelay={delay} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => (
                  <td key={j}>
                    <DecryptText text={String(v)} startDelay={delay} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

In `frontend/src/hud/Canvas.tsx`, update the `widgetFor` call (line 109) to pass the stagger delay. Change:

```tsx
            {widgetFor(widget)}
```

to:

```tsx
            {widgetFor(widget, delay)}
```

(`delay` is already destructured from `slottedWidgets` in the same `.map(({ widget, slot, delay }, i) => …)` at line 92.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hud/widgets/registry.test.tsx src/hud/Canvas.test.tsx`
Expected: PASS — existing registry/Canvas assertions plus the two new ones. (The final DOM is unchanged because `DecryptText` initial state is the final text.)

- [ ] **Step 5: Typecheck the whole frontend**

Run: `cd frontend && npm run build`
Expected: `tsc -b` passes and `vite build` completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hud/widgets/registry.tsx frontend/src/hud/widgets/KpiCard.tsx frontend/src/hud/widgets/TableWidget.tsx frontend/src/hud/Canvas.tsx frontend/src/hud/widgets/registry.test.tsx
git commit -m "feat(hud): descifra todo el texto de los banners (KPI + tabla) con stagger"
```

---

### Task 4: Holographic materialize + text fringe (CSS)

**Files:**
- Modify: `frontend/src/App.css` (replace the `.widget` animation + `widget-land` keyframe, add `widget-materialize` + `text-fringe`, extend the reduced-motion block)

**Interfaces:**
- Consumes: existing `--delay` (inherited from `.hud-slot` onto descendants), `--accent`, `--accent-soft`.
- Produces: no JS interface; purely visual. Verified by build + existing suite staying green + manual visual check.

- [ ] **Step 1: Replace the `widget-land` keyframe with `widget-materialize`**

In `frontend/src/App.css`, replace the entire `@keyframes widget-land { … }` block (currently lines ~289–310) with:

```css
/*
 * widget-materialize: la tarjeta "bootea" como un holograma —
 * flicker de proyector (opacity en pasos irregulares), split RGB
 * (drop-shadow cyan/magenta desfasado que converge a 0), spikes de brillo,
 * y micro-jitter (translate sub-pixel que se apaga). Termina en el estado de
 * reposo (border/box-shadow frío). Comparte el --delay del slot.
 */
@keyframes widget-materialize {
  0% {
    opacity: 0;
    transform: translate(-2px, 1px);
    filter:
      drop-shadow(-3px 0 rgba(255, 0, 90, 0.6))
      drop-shadow(3px 0 rgba(0, 200, 255, 0.6))
      brightness(1.8);
    border-color: var(--accent);
    box-shadow:
      0 0 0 1px var(--accent-soft),
      0 0 44px var(--accent-soft),
      0 18px 50px rgba(0, 0, 0, 0.45);
  }
  8%  { opacity: 0.65; transform: translate(2px, -1px); }
  12% { opacity: 0.18; }
  20% {
    opacity: 1;
    transform: translate(-1px, 1px);
    filter:
      drop-shadow(-2px 0 rgba(255, 0, 90, 0.5))
      drop-shadow(2px 0 rgba(0, 200, 255, 0.5))
      brightness(1.35);
  }
  28% { opacity: 0.5; }
  34% { opacity: 1; transform: translate(1px, 0); }
  46% {
    opacity: 0.82;
    transform: translate(-1px, 0);
    filter:
      drop-shadow(-1px 0 rgba(255, 0, 90, 0.35))
      drop-shadow(1px 0 rgba(0, 200, 255, 0.35))
      brightness(1.15);
  }
  60% {
    opacity: 1;
    transform: translate(0.5px, 0);
    border-color: var(--accent);
    box-shadow:
      0 0 0 1px var(--accent-soft),
      0 0 30px var(--accent-soft),
      0 18px 50px rgba(0, 0, 0, 0.45);
  }
  100% {
    opacity: 1;
    transform: translate(0, 0);
    filter:
      drop-shadow(0 0 0 transparent)
      drop-shadow(0 0 0 transparent)
      brightness(1);
    border-color: rgba(150, 185, 225, 0.16);
    box-shadow:
      0 18px 50px rgba(0, 0, 0, 0.45),
      inset 0 1px 0 rgba(200, 225, 255, 0.08);
  }
}

/* text-fringe: aberración cromática sobre el texto al desencriptarse; decae a
 * la sombra de reposo propia del elemento (sin fill-mode: no pisa el reposo). */
@keyframes text-fringe {
  0% {
    text-shadow:
      -2px 0 rgba(255, 0, 90, 0.85),
      2px 0 rgba(0, 200, 255, 0.85);
  }
  60% {
    text-shadow:
      -1px 0 rgba(255, 0, 90, 0.4),
      1px 0 rgba(0, 200, 255, 0.4);
  }
  100% {
    text-shadow:
      0 0 0 rgba(255, 0, 90, 0),
      0 0 0 rgba(0, 200, 255, 0);
  }
}
```

- [ ] **Step 2: Point `.widget` at the new animation**

In `frontend/src/App.css`, in the `.widget { … }` rule (the `animation:` line is currently line ~395), replace:

```css
  /* Destello de aterrizaje, escalonado junto al recorrido del slot. */
  animation: widget-land 0.9s ease-out var(--delay, 0ms) both;
```

with:

```css
  /* Materialización holográfica, escalonada junto al recorrido del slot. */
  animation: widget-materialize 0.85s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms) both;
```

- [ ] **Step 3: Add the text-fringe animation to the text nodes**

In `frontend/src/App.css`, add a new rule immediately after the `.kpi-value { … }` block (ends ~line 429). The fringe runs WITHOUT a fill-mode so each element falls back to its own resting `text-shadow` afterward:

```css
/* El texto hereda el fringe holográfico mientras se descifra. `--delay` se
 * hereda del .hud-slot. Sin fill-mode → vuelve a su text-shadow de reposo. */
.widget-title,
.kpi-value,
.table-widget th,
.table-widget td {
  animation: text-fringe 0.7s ease-out var(--delay, 0ms);
}
```

- [ ] **Step 4: Extend the reduced-motion block**

In `frontend/src/App.css`, inside `@media (prefers-reduced-motion: reduce) { … }`, the rule `.widget, .widget::before { animation: none !important; }` already kills `widget-materialize`. Add the text-fringe elements. After that existing rule, add:

```css
  .widget-title,
  .kpi-value,
  .table-widget th,
  .table-widget td {
    animation: none !important;
  }
```

- [ ] **Step 5: Verify build + existing suite stay green**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build passes; full vitest suite PASS (CSS changes don't affect assertions).

- [ ] **Step 6: Manual visual check**

Run: `cd frontend && npm run dev`, open the printed URL, and trigger the showcase mode: append `?hud=processing` to the URL (or press the spacebar per `App.tsx` demo mode) so KPI cards + table render.
Verify: each card flickers in with a converging cyan/magenta split and slight jitter; the numbers/labels visibly scramble then resolve to their real values, staggered card-to-card; everything settles to the calm resting glow. Then check `prefers-reduced-motion` (e.g. DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce"): cards appear instantly with final text, no flicker or scramble.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat(hud): materialización holográfica + fringe de descifrado en banners"
```

---

## Notes for the implementer

- **Why `DecryptText` starts at the final text:** testing-library flushes effects during `render()` but never advances `requestAnimationFrame`, so the DOM stays at the initial state (the final text) throughout synchronous tests. This is what keeps `registry.test.tsx`'s `getByText("3")` green. In the browser the first painted frame (final text) is hidden because the card's opacity is still ~0 during `startDelay`.
- **Filter interpolation:** every `widget-materialize` keyframe that declares `filter` uses the same shape — two `drop-shadow()` + one `brightness()` — so CSS interpolates them smoothly. Keep that shape if you tweak values.
- **`text-fringe` has no fill-mode on purpose:** with `both`/`forwards` it would clobber each element's resting `text-shadow` (e.g. `.kpi-value`'s accent glow). Letting it fall back to the static rule preserves the resting look.
- **Decrypt timing vs. the spec's "D+120ms":** the spec illustrated the decrypt starting ~120ms after the card materializes. This plan aligns the decrypt to the card's own `--delay` stagger (`startDelay={delay}`) instead — the materialize flicker keeps the card near-invisible for the first frames anyway, so the scramble reads as "data churning inside the booting hologram." If, during the Task 4 manual check, you want the extra lead, pass `startDelay={delay + 120}` from the widgets — it's a one-number tweak, not a structural change.
```
