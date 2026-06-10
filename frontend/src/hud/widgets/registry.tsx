import type { ReactElement } from "react";
import type { RenderedWidget } from "../../voice/types";
import { KpiCard } from "./KpiCard";
import { TableWidget } from "./TableWidget";

type Renderer = (w: RenderedWidget) => ReactElement;

const REGISTRY: Record<string, Renderer> = {
  kpi_card: (w) => <KpiCard title={w.title} data={w.data} />,
  table: (w) => <TableWidget title={w.title} data={w.data} />,
};

export function widgetFor(w: RenderedWidget): ReactElement {
  const renderer = REGISTRY[w.type];
  if (!renderer) {
    return <div className="widget widget-unknown">sin renderer para "{w.type}"</div>;
  }
  return renderer(w);
}
