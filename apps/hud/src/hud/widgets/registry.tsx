import type { ReactElement } from "react";
import type { RenderedWidget } from "../../voice/types";
import { KpiCard } from "./KpiCard";
import { TableWidget } from "./TableWidget";
import { MetricChart } from "./MetricChart";

type Renderer = (w: RenderedWidget, delay: number) => ReactElement;

const REGISTRY: Record<string, Renderer> = {
  kpi_card: (w, delay) => <KpiCard title={w.title} data={w.data} delay={delay} />,
  table: (w, delay) => <TableWidget title={w.title} data={w.data} delay={delay} />,
  metric_chart: (w, delay) => <MetricChart title={w.title} data={w.data} delay={delay} />,
};

export function widgetFor(w: RenderedWidget, delay = 0): ReactElement {
  const renderer = REGISTRY[w.type];
  if (!renderer) {
    return <div className="widget widget-unknown">sin renderer para "{w.type}"</div>;
  }
  return renderer(w, delay);
}
