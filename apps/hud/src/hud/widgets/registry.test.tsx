import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { widgetFor } from "./registry";

describe("widget registry", () => {
  it("kpi_card renderiza el valor de data", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: { value: 3 } });
    render(<>{el}</>);
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("type desconocido renderiza un fallback, no rompe", () => {
    const el = widgetFor({ type: "no_existe", title: "X", data: null });
    render(<>{el}</>);
    expect(screen.getByText(/sin renderer/i)).toBeInTheDocument();
  });

  it("data null renderiza estado sin datos", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: null });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });

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

  it("kpi_card con objeto sin value renderiza sin datos (no 'undefined')", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: {} });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("kpi_card con value 0 renderiza 0 (no lo trata como faltante)", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: { value: 0 } });
    render(<>{el}</>);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("metric_chart renderiza labels, valores y total", () => {
    const el = widgetFor({
      type: "metric_chart",
      title: "Posts por plataforma",
      data: {
        points: [
          { name: "instagram", value: 48 },
          { name: "tiktok", value: 12400 },
        ],
        unit: "posts",
        subtitle: "@luciano · instagram",
      },
    });
    render(<>{el}</>);
    expect(screen.getByText("Posts por plataforma")).toBeInTheDocument();
    expect(screen.getByText("@luciano · instagram")).toBeInTheDocument();
    expect(screen.getByText("instagram")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    // "12.4K" aparece dos veces: valor de la barra (12400) y total (48+12400=12448)
    expect(screen.getAllByText("12.4K")).toHaveLength(2);
    expect(screen.getByText("posts")).toBeInTheDocument();
  });

  it("metric_chart con data malformado renderiza sin datos", () => {
    const el = widgetFor({ type: "metric_chart", title: "Posts", data: { points: "nope" } });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });

  it("metric_chart con points vacío renderiza sin datos", () => {
    const el = widgetFor({ type: "metric_chart", title: "Posts", data: { points: [] } });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });
});
