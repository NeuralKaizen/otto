import type { SocialAdapter } from "./baseSocialAdapter.js";
import type { SocialProfileMetrics, SocialContentItem } from "../types.js";
import { getSocialConfig } from "../socialConfig.js";

function buildProfileUrl(platform: "instagram" | "tiktok" | "youtube", username: string): string {
  if (platform === "instagram") {
    return `https://www.instagram.com/${username}/`;
  }
  if (platform === "tiktok") {
    return `https://www.tiktok.com/@${username}`;
  }
  return `https://www.youtube.com/@${username}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seeded(hash: number, min: number, max: number): number {
  return min + (hash % (max - min + 1));
}

function mockContent(username: string, platform: string, count: number): SocialContentItem[] {
  const titles: Record<string, string[]> = {
    youtube: ["Tutorial completo", "Vlog semanal", "Review honesta", "Tips profesionales", "Detrás de cámaras"],
    instagram: ["Post de viaje", "Lifestyle update", "Collab post", "Motivación", "Behind the scenes"],
    tiktok: ["Trend del momento", "POV viral", "Tutorial rápido", "Storytime", "Challenge"],
  };
  const items = titles[platform] ?? titles.instagram;
  const now = Date.now();

  return Array.from({ length: count }, (_, i) => {
    const h = hashCode(`${username}-${platform}-${i}`);
    return {
      id: `mock-${username}-${i}`,
      title: `${items[i % items.length]} #${i + 1}`,
      url: `https://${platform}.com/@${username}/post/${i + 1}`,
      publishedAt: new Date(now - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      impressions: seeded(hashCode(`imp-${username}-${i}`), 1_000, 800_000),
      reach: seeded(hashCode(`reach-${username}-${i}`), 900, 600_000),
      views: platform !== "instagram" ? seeded(h, 5_000, 500_000) : undefined,
      likes: seeded(hashCode(`like-${username}-${i}`), 200, 50_000),
      comments: seeded(hashCode(`comm-${username}-${i}`), 10, 2_000),
      shares: seeded(hashCode(`share-${username}-${i}`), 5, 4_000),
      saves: platform === "instagram" ? seeded(hashCode(`save-${username}-${i}`), 5, 3_000) : undefined,
      clicks: seeded(hashCode(`click-${username}-${i}`), 5, 2_000),
    };
  });
}

class MockSocialAdapter implements SocialAdapter {
  constructor(public readonly platform: "instagram" | "tiktok" | "youtube") {}

  isAvailable(): boolean {
    return true;
  }

  async fetchProfileMetrics(username: string): Promise<SocialProfileMetrics> {
    const config = getSocialConfig();
    const h = hashCode(username);
    const now = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const followers = seeded(h, 1_000, 5_000_000);
    const postCount = seeded(hashCode(`posts-${username}`), 12, 800);
    const recent = mockContent(username, this.platform, 5);

    const avgLikes = Math.round(recent.reduce((s, v) => s + (v.likes ?? 0), 0) / recent.length);
    const avgComments = Math.round(recent.reduce((s, v) => s + (v.comments ?? 0), 0) / recent.length);
    const likes = recent.reduce((s, v) => s + (v.likes ?? 0), 0);
    const comments = recent.reduce((s, v) => s + (v.comments ?? 0), 0);
    const shares = recent.reduce((s, v) => s + (v.shares ?? 0), 0);
    const saves = recent.reduce((s, v) => s + (v.saves ?? 0), 0);
    const clicks = recent.reduce((s, v) => s + (v.clicks ?? 0), 0);
    const impressions = recent.reduce((s, v) => s + (v.impressions ?? 0), 0);
    const reach = recent.reduce((s, v) => s + (v.reach ?? 0), 0);
    const avgViews = this.platform !== "instagram"
      ? Math.round(recent.reduce((s, v) => s + (v.views ?? 0), 0) / recent.length)
      : undefined;

    let engagementRate: number | undefined;
    if (this.platform === "youtube" && avgViews) {
      engagementRate = parseFloat(((avgLikes + avgComments) / avgViews * 100).toFixed(2));
    } else {
      engagementRate = parseFloat(((avgLikes + avgComments) / followers * 100).toFixed(2));
    }

    const base: SocialProfileMetrics = {
      platform: this.platform,
      username,
      accountName: username.charAt(0).toUpperCase() + username.slice(1),
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      profileUrl: buildProfileUrl(this.platform, username),
      dateRange: { from, to: now },
      followers: this.platform !== "youtube" ? followers : undefined,
      following: this.platform !== "youtube" ? seeded(hashCode(`following-${username}`), 100, 2_000) : undefined,
      subscribers: this.platform === "youtube" ? followers : undefined,
      impressions,
      reach,
      engagement: likes + comments + shares + saves + clicks,
      likes,
      comments,
      shares,
      saves,
      clicks,
      totalPosts: this.platform === "instagram" ? postCount : undefined,
      totalVideos: this.platform !== "instagram" ? postCount : undefined,
      totalViews: this.platform !== "instagram" ? seeded(hashCode(`views-${username}`), 500_000, 500_000_000) : undefined,
      averageLikes: avgLikes,
      averageComments: avgComments,
      averageViews: avgViews,
      engagementRate,
      recentContent: recent,
      topPosts: [...recent]
        .sort((a, b) => ((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0)))
        .slice(0, 3),
      lastUpdated: now,
      dataSource: "mock",
      isRealData: false,
      isMock: true,
      warnings: [
        "Datos completamente simulados — no representan métricas reales.",
        "Generados de forma determinista a partir del username.",
        config.zernioEnabled
          ? "Para datos reales, conecta esta cuenta en Zernio y habilita Analytics."
          : "Para datos reales, habilita Zernio y conecta la cuenta correspondiente.",
      ],
      limitations: [],
    };
    base.limitations = [...base.warnings];

    if (this.platform === "instagram") {
      base.limitations.push("Instagram: métricas de alcance, impresiones y saves requieren cuenta profesional autenticada.");
    }
    if (this.platform === "tiktok") {
      base.limitations.push("TikTok: acceso oficial real requiere TikTok for Developers y aprobación de app.");
    }

    return base;
  }
}

export const mockInstagramAdapter = new MockSocialAdapter("instagram");
export const mockTikTokAdapter = new MockSocialAdapter("tiktok");
export const mockYouTubeAdapter = new MockSocialAdapter("youtube");
