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
    const { unmount } = render(<DecryptText text="wattson" startDelay={0} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("updates display when text prop changes without remount (normal motion)", () => {
    const { rerender } = render(<DecryptText text="uno" startDelay={0} />);
    expect(screen.getByText("uno")).toBeInTheDocument();
    rerender(<DecryptText text="dos" startDelay={0} />);
    expect(screen.getByText("dos")).toBeInTheDocument();
  });

  it("updates display on text change under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    );
    const { rerender } = render(<DecryptText text="10" startDelay={0} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    rerender(<DecryptText text="20" startDelay={0} />);
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});
