import type { SocialAdapter } from "./baseSocialAdapter.js";
import type { SocialProfileMetrics } from "../types.js";
import { mockInstagramAdapter } from "./mockSocialAdapter.js";

class InstagramAdapter implements SocialAdapter {
  readonly platform = "instagram" as const;

  isAvailable(): boolean {
    // Real Instagram metrics require Instagram Graph API + professional account auth.
    // Placeholder: always false until credentials are configured.
    return (
      process.env.ENABLE_INSTAGRAM_REAL_METRICS === "true" &&
      Boolean(process.env.INSTAGRAM_ACCESS_TOKEN)
    );
  }

  async fetchProfileMetrics(username: string): Promise<SocialProfileMetrics> {
    // When real adapter is implemented:
    // - Use Instagram Graph API with INSTAGRAM_ACCESS_TOKEN
    // - Followers, media count, and basic profile are accessible with public data scope
    // - Reach, impressions, saves, profile views require Business/Creator account auth
    // - Never scrape — violates Instagram ToS

    const fallback = await mockInstagramAdapter.fetchProfileMetrics(username);
    return {
      ...fallback,
      limitations: [
        "Instagram Graph API requiere autenticación de cuenta profesional (Business/Creator).",
        "Métricas públicas disponibles: seguidores, bio, URL.",
        "Métricas privadas (alcance, impresiones, saves, demografía) requieren token de acceso del dueño de la cuenta.",
        "No se utiliza scraping — viola los Términos de Servicio de Instagram.",
        ...fallback.limitations,
      ],
    };
  }
}

export const instagramAdapter = new InstagramAdapter();
