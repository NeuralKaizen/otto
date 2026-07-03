import { describe, it, expect } from "vitest";
import { formatCompact } from "./format";

describe("formatCompact", () => {
  it("números pequeños tal cual", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(950)).toBe("950");
  });
  it("miles con una decimal, sin .0 redundante", () => {
    expect(formatCompact(1000)).toBe("1K");
    expect(formatCompact(12400)).toBe("12.4K");
  });
  it("millones", () => {
    expect(formatCompact(1200000)).toBe("1.2M");
    expect(formatCompact(2000000)).toBe("2M");
  });
});
