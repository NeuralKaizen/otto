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

  it("coreografía narrativa: delays acumulativos por tipo, en orden de emisión", () => {
    const { container } = render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "Seguidores", data: { value: 100 } }, // t=0
          { type: "metric_chart", title: "Posts", data: { points: [{ name: "ig", value: 5 }] } }, // t=380
          { type: "kpi_card", title: "Engagement", data: { value: 4 } }, // t=380+650=1030
        ]}
      />,
    );
    const delays = Array.from(container.querySelectorAll(".hud-slot")).map((el) =>
      (el as HTMLElement).style.getPropertyValue("--delay"),
    );
    expect(delays).toEqual(["0ms", "380ms", "1030ms"]);
  });

  it("los charts van al arco izquierdo (tx negativo) y los KPIs al derecho (tx positivo)", () => {
    const { container } = render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "K", data: { value: 1 } },
          { type: "metric_chart", title: "C", data: { points: [{ name: "ig", value: 5 }] } },
        ]}
      />,
    );
    const slots = Array.from(container.querySelectorAll(".hud-slot")) as HTMLElement[];
    expect(Number(slots[0].style.getPropertyValue("--tx"))).toBeGreaterThan(0);
    expect(Number(slots[1].style.getPropertyValue("--tx"))).toBeLessThan(0);
  });
});
