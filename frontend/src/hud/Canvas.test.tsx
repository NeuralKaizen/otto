import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Canvas } from "./Canvas";

describe("Canvas", () => {
  it("renderiza un widget por cada entrada del spec", () => {
    render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "Atrasadas", data: { value: 3 } },
          { type: "kpi_card", title: "Activas", data: { value: 12 } },
        ]}
      />,
    );
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("Activas")).toBeInTheDocument();
  });
});
