import type { SocialAdapter } from "./baseSocialAdapter.js";
import type { SocialProfileMetrics } from "../types.js";
import { mockTikTokAdapter } from "./mockSocialAdapter.js";

class TikTokAdapter implements SocialAdapter {
  readonly platform = "tiktok" as const;

  isAvailable(): boolean {
    // Real TikTok metrics require TikTok for Developers app approval.
    // Placeholder: always false until credentials are configured.
    return (
      process.env.ENABLE_TIKTOK_REAL_METRICS === "true" &&
      Boolean(process.env.TIKTOK_ACCESS_TOKEN)
    );
  }

  async fetchProfileMetrics(username: string): Promise<SocialProfileMetrics> {
    // When real adapter is implemented:
    // - Use TikTok Research API or Content Posting API
    // - Requires approved developer app and user OAuth
    // - Public stats accessible: followers, likes, video count
    // - Private stats (views breakdown, traffic sources) require additional scopes
    // - Never scrape — violates TikTok ToS

    const fallback = await mockTikTokAdapter.fetchProfileMetrics(username);
    return {
      ...fallback,
      limitations: [
        "TikTok for Developers requiere aprobación de app para acceso a métricas.",
        "Métricas públicas básicas: seguidores, likes totales, cantidad de videos.",
        "Métricas avanzadas (retención, traffic sources, demografía) requieren OAuth del dueño.",
        "No se utiliza scraping — viola los Términos de Servicio de TikTok.",
        ...fallback.limitations,
      ],
    };
  }
}

export const tiktokAdapter = new TikTokAdapter();
