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
});
