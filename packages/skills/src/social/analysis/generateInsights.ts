import type { SocialProfileMetrics } from "../types.js";
import { formatLargeNumber, scoreAccountHealth } from "./computeMetrics.js";

export interface InsightsResult {
  insights: string[];
  recommendations: string[];
}

export function generateInsights(profiles: SocialProfileMetrics[]): InsightsResult {
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (profiles.length === 0) {
    return {
      insights: ["No se encontraron perfiles para analizar."],
      recommendations: ["Verifica el username e intenta de nuevo."],
    };
  }

  for (const profile of profiles) {
    const platform = profile.platform.charAt(0).toUpperCase() + profile.platform.slice(1);
    const reach = profile.followers ?? profile.subscribers;

    if (profile.dataSource === "unavailable") {
      insights.push(`${platform} @${profile.username}: métricas reales no disponibles. Esta consulta requiere una cuenta conectada en Zernio con acceso a Analytics.`);
      recommendations.push(`Para ${platform}, conecta la cuenta correspondiente en Zernio y verifica que el plan tenga Analytics.`);
      continue;
    }

    if (!profile.isRealData) {
      insights.push(`${platform} @${profile.username}: datos simulados (${profile.dataSource}). Conecta la cuenta en Zernio para reemplazarlos por métricas reales.`);
      continue;
    }

    if (reach !== undefined) {
      insights.push(`${platform} @${profile.username}: ${formatLargeNumber(reach)} ${profile.platform === "youtube" ? "suscriptores" : "seguidores"}.`);
    }

    if (profile.engagementRate !== undefined) {
      const health = scoreAccountHealth(profile.engagementRate, profile.platform);
      const labels: Record<string, string> = {
        excellent: "excelente conexión con la audiencia",
        good: "buena conexión con la audiencia",
        average: "engagement promedio del mercado",
        low: "engagement bajo — posible baja distribución",
        unknown: "engagement desconocido",
      };
      insights.push(`${platform}: engagement rate ${profile.engagementRate}% — ${labels[health]}.`);

      if (health === "low") {
        recommendations.push(`Aumentar frecuencia y consistencia de publicaciones en ${platform}.`);
        recommendations.push(`Revisar tipo de contenido y horarios de publicación en ${platform}.`);
      } else if (health === "excellent" || health === "good") {
        recommendations.push(`Mantener la estrategia de contenido en ${platform} — está funcionando bien.`);
      }
    }

    const postCount = profile.totalPosts ?? profile.totalVideos;
    if (postCount !== undefined && postCount < 20) {
      recommendations.push(`${platform} @${profile.username}: solo ${postCount} publicaciones. Mayor consistencia de contenido puede acelerar el crecimiento.`);
    }

    if (profile.averageViews !== undefined && reach !== undefined && reach > 0) {
      const reachRatio = (profile.averageViews / reach) * 100;
      if (reachRatio < 5) {
        insights.push(`${platform}: el promedio de vistas (${formatLargeNumber(profile.averageViews)}) es bajo respecto a la audiencia — posible baja distribución orgánica.`);
      }
    }
  }

  // Cross-platform comparison
  if (profiles.length > 1) {
    const realProfiles = profiles.filter((p) => p.isRealData && p.dataSource !== "unavailable");
    if (realProfiles.length > 0) {
      insights.push(`Comparación cross-platform disponible para ${realProfiles.length} plataforma(s) con datos reales.`);
    }
    recommendations.push("Mantener consistencia de username y marca visual en todas las plataformas.");
  }

  if (profiles.some((profile) => profile.dataSource === "mock")) {
    recommendations.push("Conecta la cuenta real en Zernio para validar estas hipótesis con datos observados y no simulados.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Continuar monitoreando métricas regularmente para detectar tendencias.");
  }

  return { insights, recommendations };
}
