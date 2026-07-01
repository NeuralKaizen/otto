import "@testing-library/jest-dom";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecryptText } from "./DecryptText";

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
