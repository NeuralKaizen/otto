import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  return (
    <div className="hud-canvas">
      {widgets.map((w, i) => (
        <div
          key={`${w.type}-${w.title}-${i}`}
          className="hud-slot"
          style={{ animationDelay: `${i * 110}ms` }}
        >
          {widgetFor(w)}
        </div>
      ))}
    </div>
  );
}
