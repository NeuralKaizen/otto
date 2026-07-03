import type { RenderedWidget } from "../voice/types";

// Datos que consume el widget metric_chart.
export interface MetricChartData {
  points: { name: string; value: number }[];
  unit?: string;
  subtitle?: string;
}

// Alias defensivos: el nombre canónico del skill es social_metrics_lookup,
// los otros son los que usa Jarvis_mvp — cubrirlos cuesta nada.
const SOCIAL_TOOLS = new Set(["social_metrics_lookup", "social_metrics", "social_metrics_skill"]);

const TITLE_MAX = 15;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function truncate(s: string): string {
  return s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX)}…` : s;
}

// El resultado cruza el WS como JSON: nada aquí confía en el shape.
// Cualquier cosa inesperada → [] (el HUD simplemente no muestra gráficas).
export function widgetsFromToolResult(toolName: string, result: unknown): RenderedWidget[] {
  if (!SOCIAL_TOOLS.has(toolName) || !isRecord(result)) return [];
  const profiles = Array.isArray(result.profiles) ? result.profiles.filter(isRecord) : [];
  if (profiles.length === 0) return [];

  const first = profiles[0];
  const subtitleParts = [
    typeof first.username === "string" && first.username ? `@${first.username}` : null,
    typeof first.platform === "string" && first.platform !== "unknown" ? first.platform : null,
  ].filter((p): p is string => p !== null);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

  const widgets: RenderedWidget[] = [];

  // El orden de emisión ES la narrativa del reveal: cabecera → desgloses → top.
  const followers = toNum(first.followers) || toNum(first.subscribers);
  if (followers > 0) widgets.push({ type: "kpi_card", title: "Seguidores", data: { value: followers } });

  const rate = toNum(first.engagementRate);
  if (rate > 0) widgets.push({ type: "kpi_card", title: "Engagement", data: { value: `${rate.toFixed(1)}%` } });

  const perPlatform = (title: string, unit: string, pick: (p: Record<string, unknown>) => number) => {
    const points = profiles
      .map((p) => ({ name: String(p.platform ?? "?"), value: pick(p) }))
      .filter((d) => d.value > 0);
    if (points.length > 0) {
      const data: MetricChartData = { points, unit, subtitle };
      widgets.push({ type: "metric_chart", title, data });
    }
  };
  perPlatform("Posts por plataforma", "posts", (p) => toNum(p.totalPosts));
  perPlatform("Likes por plataforma", "likes", (p) => toNum(p.totalLikes) || toNum(p.likes));
  perPlatform("Vistas por plataforma", "vistas", (p) => toNum(p.totalViews));

  const rawTop = Array.isArray(first.topPosts)
    ? first.topPosts
    : Array.isArray(first.recentContent)
    ? first.recentContent
    : [];
  const topPoints = rawTop
    .filter(isRecord)
    .slice(0, 5)
    .map((p, i) => ({
      name: typeof p.title === "string" && p.title ? truncate(p.title) : `Post ${i + 1}`,
      value: toNum(p.likes) || toNum(p.views) || toNum(p.impressions),
    }))
    .filter((d) => d.value > 0);
  if (topPoints.length > 0) {
    const data: MetricChartData = { points: topPoints, subtitle };
    widgets.push({ type: "metric_chart", title: "Top contenido", data });
  }

  return widgets;
}
