import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { scrambleFrame, GLYPH_POOL, DecryptText } from "./DecryptText";

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
