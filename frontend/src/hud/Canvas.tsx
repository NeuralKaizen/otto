import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  return (
    <div className="hud-canvas">
      {widgets.map((w, i) => (
        <div key={i} className="hud-slot">{widgetFor(w)}</div>
      ))}
    </div>
  );
}
