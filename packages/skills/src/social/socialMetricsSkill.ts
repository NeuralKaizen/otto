import type { SkillDefinition, SkillContext } from "../types.js";
import type { SocialContentItem, SocialMetricsResponse, SocialProfileMetrics } from "./types.js";
import { parseSocialRequest } from "./socialParser.js";
import { getSocialConfig } from "./socialConfig.js";
import { routePlatformRequest } from "./platformRouter.js";

interface SocialMetricsInput {
  message: string;
}

function getEngagementValue(item: SocialContentItem): number {
  return item.engagement ?? ((item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0) + (item.saves ?? 0) + (item.clicks ?? 0));
}

function pickRankingMetric(items: SocialContentItem[]): "views" | "impressions" | "engagement" {
  if (items.some((item) => item.views !== undefined)) {
    return "views";
  }
  if (items.some((item) => item.impressions !== undefined)) {
    return "impressions";
  }
  return "engagement";
}

function getMetricValue(item: SocialContentItem, metric: "views" | "impressions" | "engagement"): number {
  if (metric === "views") {
    return item.views ?? Number.NEGATIVE_INFINITY;
  }
  if (metric === "impressions") {
    return item.impressions ?? Number.NEGATIVE_INFINITY;
  }
  return getEngagementValue(item);
}

function formatMetricLabel(metric: "views" | "impressions" | "engagement"): string {
  if (metric === "views") return "vistas";
  if (metric === "impressions") return "impresiones";
  return "engagement";
}

function formatMetricValue(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("es-CO") : "N/D";
}

function rankTopContent(items: SocialContentItem[]): {
  metric: "views" | "impressions" | "engagement";
  items: SocialContentItem[];
} {
  const metric = pickRankingMetric(items);
  const ranked = [...items].sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));

  return {
    metric,
    items: ranked.slice(0, 3),
  };
}

function buildTopContentResponse(result: SocialMetricsResponse): SocialMetricsResponse {
  const rankedProfiles: SocialProfileMetrics[] = [];
  const summaryLines: string[] = [];
  const insightLines: string[] = [];
  let rankingMetric: "views" | "impressions" | "engagement" | undefined;

  for (const profile of result.profiles) {
    const candidateItems = profile.topPosts?.length
      ? profile.topPosts
      : profile.recentContent?.length
      ? profile.recentContent
      : [];

    if (candidateItems.length === 0) {
      rankedProfiles.push(profile);
      continue;
    }

    const ranked = rankTopContent(candidateItems);
    rankingMetric ??= ranked.metric;
    const metricLabel = formatMetricLabel(ranked.metric);

    rankedProfiles.push({
      ...profile,
      topPosts: ranked.items,
    });

    const topSummary = ranked.items
      .map((item, index) => {
        const label = item.title ?? item.url ?? item.id ?? `Contenido ${index + 1}`;
        return `${index + 1}. ${label} (${metricLabel}: ${formatMetricValue(getMetricValue(item, ranked.metric))})`;
      })
      .join(" | ");

    summaryLines.push(`@${profile.username} en ${profile.platform}: ${topSummary}`);
    insightLines.push(`Top contenido de @${profile.username} ordenado por ${metricLabel}: ${topSummary}`);
  }

  const sourceLabel =
    result.dataSource === "zernio"
      ? "Fuente: Zernio."
      : result.dataSource === "mock"
      ? "Fuente: Mock / datos simulados."
      : "Fuente: Servicio no disponible.";

  if (summaryLines.length === 0) {
    return {
      ...result,
      contentFocus: "top_content",
      rankingMetric,
      summary: `${sourceLabel} No encontré contenido reciente para rankear en esta cuenta.`,
    };
  }

  const metricLabel = rankingMetric ? formatMetricLabel(rankingMetric) : "rendimiento";

  return {
    ...result,
    profiles: rankedProfiles,
    contentFocus: "top_content",
    rankingMetric,
    summary: `${sourceLabel} Top 3 contenidos para esta cuenta, ordenados por ${metricLabel}. ${summaryLines.join(" ")}`,
    insights: [
      `${sourceLabel} Ranking resuelto con contexto de sesión y datos de ${result.dataSource === "zernio" ? "Zernio" : result.dataSource}.`,
      ...insightLines,
      ...result.insights,
    ],
  };
}

export const socialMetricsSkill: SkillDefinition<SocialMetricsInput, SocialMetricsResponse> = {
  name: "social_metrics_lookup",
  description: "Obtiene y analiza métricas de Instagram, TikTok y YouTube por username. Usa Zernio si está configurado y mock seguro si no.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["social.read_public"],

  async execute(args: SocialMetricsInput, ctx: SkillContext): Promise<SocialMetricsResponse> {
    const { platform, username, queryType } = parseSocialRequest(args.message, {
      // Prioridad: @ explícito en el mensaje > cuenta del follow-up en sesión > cuenta propia configurada.
      fallbackUsername: ctx.socialContext?.username ?? getSocialConfig().defaultUsername,
      fallbackPlatform: ctx.socialContext?.platform as import("./types.js").SocialPlatform | undefined,
    });

    if (!username) {
      if (queryType === "top_content") {
        return {
          request: { platform, username: "" },
          profiles: [],
          summary: "¿De qué cuenta quieres que revise el contenido más visto?",
          insights: [],
          recommendations: [
            "Indícame la cuenta y, si quieres, la plataforma. Ejemplo: '@lucianomusellaa en Instagram'.",
          ],
          dataSource: "unavailable",
          isMock: false,
          contentFocus: "top_content",
          warnings: ["No tengo una cuenta previa en el contexto de esta conversación para resolver el follow-up."],
          unavailable: [],
        };
      }

      return {
        request: { platform, username: "" },
        profiles: [],
        summary: "No se encontró username en el mensaje. Por favor indica @username o la URL del perfil.",
        insights: [],
        recommendations: [
          "Escribe el username con @ o proporciona la URL del perfil. Ejemplo: '@mkbhd' o 'youtube.com/@mkbhd'.",
        ],
        dataSource: "unavailable",
        isMock: false,
        warnings: ["No se encontró un username utilizable en el prompt ni en el contexto de sesión."],
        unavailable: [],
      };
    }

    const result = await routePlatformRequest({
      platform,
      username,
      includeRecentContent: true,
      includeAnalysis: true,
    });

    return queryType === "top_content"
      ? buildTopContentResponse(result)
      : result;
  },
};
