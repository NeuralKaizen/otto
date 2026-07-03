import type { SocialAdapter } from "./baseSocialAdapter.js";
import type { SocialProfileMetrics, SocialContentItem } from "../types.js";
import { mockYouTubeAdapter } from "./mockSocialAdapter.js";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YtChannelItem {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
  statistics: { subscriberCount: string; viewCount: string; videoCount: string; hiddenSubscriberCount: boolean };
}

interface YtPlaylistItem {
  snippet: {
    title: string;
    resourceId: { videoId: string };
    publishedAt: string;
  };
}

interface YtVideoItem {
  id: string;
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
}

async function ytGet<T>(path: string, apiKey: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${YT_API_BASE}${path}${sep}key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function resolveChannel(username: string, apiKey: string): Promise<YtChannelItem | null> {
  const clean = username.replace(/^@/, "");

  // 1. Try forHandle (for @handle lookups — most reliable for modern channels)
  try {
    const data = await ytGet<{ items?: YtChannelItem[] }>(
      `/channels?part=snippet,statistics&forHandle=${encodeURIComponent(clean)}`,
      apiKey
    );
    if (data.items && data.items.length > 0) return data.items[0];
  } catch {
    // fall through
  }

  // 2. Try by channel ID (UCxxx pattern)
  if (/^UC[\w-]{22}$/.test(clean)) {
    try {
      const data = await ytGet<{ items?: YtChannelItem[] }>(
        `/channels?part=snippet,statistics&id=${encodeURIComponent(clean)}`,
        apiKey
      );
      if (data.items && data.items.length > 0) return data.items[0];
    } catch {
      // fall through
    }
  }

  return null;
}

async function fetchRecentVideos(channelId: string, apiKey: string): Promise<SocialContentItem[]> {
  // Use uploads playlist (channel UC→UU) — costs 1 quota unit instead of 100 for search
  const uploadsPlaylistId = channelId.replace(/^UC/, "UU");

  try {
    const playlistData = await ytGet<{ items?: YtPlaylistItem[] }>(
      `/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5`,
      apiKey
    );
    const items = playlistData.items ?? [];
    if (items.length === 0) return [];

    const videoIds = items.map((i) => i.snippet.resourceId.videoId).join(",");
    const statsData = await ytGet<{ items?: YtVideoItem[] }>(
      `/videos?part=statistics&id=${encodeURIComponent(videoIds)}`,
      apiKey
    );
    const statsMap = new Map((statsData.items ?? []).map((v) => [v.id, v.statistics]));

    return items.map((item) => {
      const videoId = item.snippet.resourceId.videoId;
      const stats = statsMap.get(videoId);
      return {
        id: videoId,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: item.snippet.publishedAt,
        views: stats?.viewCount ? parseInt(stats.viewCount, 10) : undefined,
        likes: stats?.likeCount ? parseInt(stats.likeCount, 10) : undefined,
        comments: stats?.commentCount ? parseInt(stats.commentCount, 10) : undefined,
      };
    });
  } catch {
    return [];
  }
}

class YouTubeAdapter implements SocialAdapter {
  readonly platform = "youtube" as const;

  isAvailable(): boolean {
    return (
      process.env.ENABLE_YOUTUBE_REAL_METRICS === "true" &&
      Boolean(process.env.YOUTUBE_API_KEY)
    );
  }

  async fetchProfileMetrics(username: string): Promise<SocialProfileMetrics> {
    const apiKey = process.env.YOUTUBE_API_KEY!;
    const now = new Date().toISOString();

    let channel: YtChannelItem | null = null;
    try {
      channel = await resolveChannel(username, apiKey);
    } catch (err) {
      console.warn("[youtubeAdapter] resolve failed, falling back to mock:", String(err));
    }

    if (!channel) {
      const fallback = await mockYouTubeAdapter.fetchProfileMetrics(username);
      return {
        ...fallback,
        limitations: [
          `Canal "${username}" no encontrado en YouTube. Verifica el handle o URL.`,
          "YouTube puede no reconocer handles sin el prefijo @.",
          ...fallback.limitations,
        ],
      };
    }

    const stats = channel.statistics;
    const subscribers = stats.hiddenSubscriberCount
      ? undefined
      : parseInt(stats.subscriberCount, 10);
    const totalViews = parseInt(stats.viewCount, 10);
    const videoCount = parseInt(stats.videoCount, 10);

    const recentContent = await fetchRecentVideos(channel.id, apiKey);

    let avgLikes: number | undefined;
    let avgComments: number | undefined;
    let avgViews: number | undefined;
    let engagementRate: number | undefined;

    if (recentContent.length > 0) {
      const withViews = recentContent.filter((v) => v.views !== undefined);
      const withLikes = recentContent.filter((v) => v.likes !== undefined);
      const withComments = recentContent.filter((v) => v.comments !== undefined);

      avgViews = withViews.length > 0
        ? Math.round(withViews.reduce((s, v) => s + (v.views ?? 0), 0) / withViews.length)
        : undefined;
      avgLikes = withLikes.length > 0
        ? Math.round(withLikes.reduce((s, v) => s + (v.likes ?? 0), 0) / withLikes.length)
        : undefined;
      avgComments = withComments.length > 0
        ? Math.round(withComments.reduce((s, v) => s + (v.comments ?? 0), 0) / withComments.length)
        : undefined;

      if (avgViews && avgViews > 0 && (avgLikes !== undefined || avgComments !== undefined)) {
        engagementRate = parseFloat((((avgLikes ?? 0) + (avgComments ?? 0)) / avgViews * 100).toFixed(2));
      }
    }

    const limitations: string[] = [
      "YouTube redondea subscriber counts en canales grandes.",
      "Engagement rate calculado sobre videos recientes — puede variar.",
    ];
    if (stats.hiddenSubscriberCount) {
      limitations.push("Este canal tiene los suscriptores ocultos — no disponible públicamente.");
    }
    if (recentContent.length === 0) {
      limitations.push("No se encontraron videos recientes para calcular promedios.");
    }

    return {
      platform: "youtube",
      username,
      accountName: channel.snippet.title,
      displayName: channel.snippet.title,
      profileUrl: `https://www.youtube.com/@${channel.snippet.customUrl ?? username}`,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
      subscribers,
      likes: avgLikes,
      comments: avgComments,
      totalViews,
      totalVideos: videoCount,
      averageViews: avgViews,
      averageLikes: avgLikes,
      averageComments: avgComments,
      engagementRate,
      recentContent,
      topPosts: [...recentContent]
        .sort((a, b) => (((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0))))
        .slice(0, 3),
      lastUpdated: now,
      dataSource: "youtube_api",
      isRealData: true,
      isMock: false,
      warnings: [...limitations],
      limitations,
      rawProvider: "youtube_api",
    };
  }
}

export const youtubeAdapter = new YouTubeAdapter();
