import { describe, it, expect } from "vitest";
import { scrambleFrame, GLYPH_POOL } from "./scramble";

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
    expect(scrambleFrame("wattson", 0.25, GLYPH_POOL, 9)).toBe(
      scrambleFrame("wattson", 0.25, GLYPH_POOL, 9),
    );
  });

  it("clamps out-of-range progress", () => {
    expect(scrambleFrame("xy", 2, GLYPH_POOL, 0)).toBe("xy");
    expect(scrambleFrame("xy", -1, GLYPH_POOL, 0)).toHaveLength(2);
  });
});
