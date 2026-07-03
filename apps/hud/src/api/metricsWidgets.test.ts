import { describe, it, expect } from "vitest";
import { widgetsFromToolResult } from "./metricsWidgets";

// Shape real de SocialMetricsResponse (packages/skills/src/social/types.ts)
const zernioResult = {
  request: { platform: "all", username: "luciano" },
  profiles: [
    {
      platform: "instagram",
      username: "luciano",
      followers: 12400,
      engagementRate: 4.27,
      totalPosts: 48,
      totalLikes: 5300,
      totalViews: 91000,
      topPosts: [
        { title: "Lanzamiento del HUD de Wattson", likes: 900 },
        { title: "Detrás de cámaras", views: 700 },
        { title: "corto", impressions: 300 },
      ],
      lastUpdated: "2026-07-01",
    },
    {
      platform: "tiktok",
      username: "luciano",
      totalPosts: 21,
      totalLikes: 8800,
      totalViews: 240000,
      lastUpdated: "2026-07-01",
    },
  ],
  summary: "ok",
  insights: [],
  recommendations: [],
  dataSource: "zernio",
  isMock: false,
  warnings: [],
  unavailable: [],
};

describe("widgetsFromToolResult", () => {
  it("shape Zernio multi-perfil → KPIs + charts por plataforma + top contenido, en orden narrativo", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", zernioResult);
    expect(w.map((x) => `${x.type}:${x.title}`)).toEqual([
      "kpi_card:Seguidores",
      "kpi_card:Engagement",
      "metric_chart:Posts por plataforma",
      "metric_chart:Likes por plataforma",
      "metric_chart:Vistas por plataforma",
      "metric_chart:Top contenido",
    ]);
    expect(w[0].data).toEqual({ value: 12400 });
    expect(w[1].data).toEqual({ value: "4.3%" });
    expect(w[2].data).toMatchObject({
      points: [
        { name: "instagram", value: 48 },
        { name: "tiktok", value: 21 },
      ],
      unit: "posts",
      subtitle: "@luciano · instagram",
    });
  });

  it("top contenido: top 5, trunca títulos largos a 15 chars + elipsis, fallback 'Post N'", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", zernioResult);
    const top = w.find((x) => x.title === "Top contenido")!;
    const points = (top.data as { points: { name: string; value: number }[] }).points;
    expect(points[0]).toEqual({ name: "Lanzamiento del…", value: 900 });
    expect(points[1]).toEqual({ name: "Detrás de cámar…", value: 700 });
    expect(points[2]).toEqual({ name: "corto", value: 300 });
  });

  it("subscribers cubre followers (YouTube)", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", {
      profiles: [{ platform: "youtube", username: "mkbhd", subscribers: 2000, lastUpdated: "t" }],
    });
    expect(w[0]).toMatchObject({ type: "kpi_card", title: "Seguidores", data: { value: 2000 } });
  });

  it("profiles vacío (respuesta 'no encontré username') → []", () => {
    expect(
      widgetsFromToolResult("social_metrics_lookup", { profiles: [], summary: "no username" }),
    ).toEqual([]);
  });

  it("tool ajeno → []", () => {
    expect(widgetsFromToolResult("notion_query", zernioResult)).toEqual([]);
  });

  it("shapes corruptos → [] sin lanzar", () => {
    expect(widgetsFromToolResult("social_metrics_lookup", null)).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", "boom")).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", { profiles: "nope" })).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", { profiles: [null, 7] })).toEqual([]);
  });

  it("métricas en 0 o ausentes no generan charts vacíos", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", {
      profiles: [{ platform: "instagram", username: "x", totalPosts: 0, lastUpdated: "t" }],
    });
    expect(w).toEqual([]);
  });
});
