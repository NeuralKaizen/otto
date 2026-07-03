import type { SocialAdapter } from "./baseSocialAdapter.js";
import { SocialAdapterError } from "./baseSocialAdapter.js";
import type { SocialContentItem, SocialDateRange, SocialGrowthSnapshot, SocialProfileMetrics } from "../types.js";
import { calculateAverages, calculateEngagementRate } from "../analysis/computeMetrics.js";
import { getSocialConfig, isZernioRealAdapterAvailable } from "../socialConfig.js";
import { normalizeUsername } from "../socialParser.js";
import {
  ZERNIO_ENDPOINTS,
  buildZernioPath,
  type ZernioAccountRecord,
  type ZernioAccountsResponse,
  type ZernioAnalyticsPlatformRecord,
  type ZernioAnalyticsPostRecord,
  type ZernioAnalyticsResponse,
  type ZernioFollowerStatPoint,
  type ZernioFollowerStatsAccount,
  type ZernioFollowerStatsResponse,
} from "./zernioEndpoints.js";

type SupportedPlatform = "instagram" | "tiktok" | "youtube";

interface ResolvedFollowerStats {
  currentFollowers?: number;
  growth: SocialGrowthSnapshot[];
}

interface ResolvedRecentAnalytics {
  dateRange: SocialDateRange;
  recentContent: SocialContentItem[];
  topPosts: SocialContentItem[];
  impressions?: number;
  reach?: number;
  engagement?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  averageViews?: number;
  averageLikes?: number;
  averageComments?: number;
  engagementRate?: number;
  lastUpdated?: string;
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function getAccountId(account: { _id?: string; id?: string; accountId?: string }): string | undefined {
  return account.accountId ?? account._id ?? account.id;
}

function normalizeHandle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return normalizeUsername(value);
}

function buildFallbackProfileUrl(platform: SupportedPlatform, username: string): string {
  if (platform === "instagram") {
    return `https://www.instagram.com/${username}/`;
  }
  if (platform === "tiktok") {
    return `https://www.tiktok.com/@${username}`;
  }
  return username.startsWith("UC")
    ? `https://www.youtube.com/channel/${username}`
    : `https://www.youtube.com/@${username}`;
}

function createDefaultDateRange(): SocialDateRange {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function extractAccounts(response: ZernioAccountsResponse): ZernioAccountRecord[] {
  if (Array.isArray(response.accounts)) {
    return response.accounts;
  }
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (response.data && typeof response.data === "object" && Array.isArray(response.data.accounts)) {
    return response.data.accounts;
  }
  return [];
}

function extractAnalyticsPosts(response: ZernioAnalyticsResponse | ZernioAnalyticsPostRecord): ZernioAnalyticsPostRecord[] {
  if (Array.isArray((response as ZernioAnalyticsResponse).posts)) {
    return (response as ZernioAnalyticsResponse).posts ?? [];
  }
  if (Array.isArray((response as ZernioAnalyticsResponse).items)) {
    return (response as ZernioAnalyticsResponse).items ?? [];
  }
  if ((response as ZernioAnalyticsResponse).data && typeof (response as ZernioAnalyticsResponse).data === "object") {
    const data = (response as ZernioAnalyticsResponse).data as ZernioAnalyticsResponse["data"];
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === "object") {
      if (Array.isArray(data.posts)) {
        return data.posts;
      }
      if (Array.isArray(data.items)) {
        return data.items;
      }
    }
  }
  if ("postId" in response || "platformPostId" in response) {
    return [response as ZernioAnalyticsPostRecord];
  }
  return [];
}

function pickPlatformAnalytics(
  post: ZernioAnalyticsPostRecord,
  accountId: string
): ZernioAnalyticsPlatformRecord | undefined {
  return post.platformAnalytics?.find((item) => item.accountId === accountId) ?? post.platformAnalytics?.[0];
}

function classifyZernioError(status: number, payload: unknown): SocialAdapterError {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const error = typeof body.error === "string" ? body.error : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;
  const code = typeof body.code === "string" ? body.code : undefined;
  const requiresAddon = body.requiresAddon === true || code === "analytics_addon_required";
  const details = message ?? error ?? `Zernio request failed with status ${status}.`;

  if (requiresAddon || status === 402) {
    return new SocialAdapterError(
      "Zernio requiere el Analytics add-on para esta consulta de métricas.",
      { code: "zernio_analytics_addon_required", recoverable: true, statusCode: status }
    );
  }

  if (status === 401 || status === 403) {
    return new SocialAdapterError(
      "Zernio rechazó la autenticación o permisos de esta cuenta.",
      { code: "zernio_auth_error", recoverable: true, statusCode: status }
    );
  }

  if (status === 404) {
    return new SocialAdapterError(
      "La cuenta conectada no tiene datos de analytics disponibles en Zernio.",
      { code: "zernio_not_found", recoverable: true, statusCode: status }
    );
  }

  if (status === 429 || status >= 500) {
    return new SocialAdapterError(
      "Zernio no respondió de forma estable en este momento.",
      { code: "zernio_temporal_error", recoverable: true, statusCode: status }
    );
  }

  return new SocialAdapterError(details, {
    code: "zernio_request_failed",
    recoverable: true,
    statusCode: status,
  });
}

class ZernioPlatformAdapter implements SocialAdapter {
  constructor(public readonly platform: SupportedPlatform) {}

  isAvailable(): boolean {
    return isZernioRealAdapterAvailable(getSocialConfig());
  }

  async fetchProfileMetrics(username: string): Promise<SocialProfileMetrics> {
    const config = getSocialConfig();
    if (!config.zernioApiKey) {
      throw new SocialAdapterError("Falta ZERNIO_API_KEY para consultar Zernio.", {
        code: "zernio_missing_api_key",
        recoverable: true,
      });
    }

    const connectedAccount = await this.findMatchingAccount(username);
    if (!connectedAccount) {
      throw new SocialAdapterError(
        `No hay una cuenta ${this.platform} conectada en Zernio que coincida con @${username}.`,
        { code: "zernio_account_not_connected", recoverable: true }
      );
    }

    const accountId = getAccountId(connectedAccount);
    if (!accountId) {
      throw new SocialAdapterError(
        `Zernio devolvió una cuenta ${this.platform} sin identificador utilizable.`,
        { code: "zernio_invalid_account", recoverable: true }
      );
    }

    const limitations: string[] = [
      "Datos reales obtenidos desde una cuenta conectada en Zernio.",
      config.zernioReadOnlyMode
        ? "El adaptador corre en modo lectura: no realiza acciones de publicación ni escritura."
        : "Este adaptador solo usa endpoints GET aunque ZERNIO_READ_ONLY_MODE=false.",
      "Los analytics reflejan lo que Zernio puede leer de la cuenta conectada y del plan activo.",
    ];

    const errors: SocialAdapterError[] = [];
    let followerStats: ResolvedFollowerStats | null = null;
    let recentAnalytics: ResolvedRecentAnalytics | null = null;

    try {
      followerStats = await this.fetchFollowerStats(accountId);
    } catch (error) {
      const parsed = this.toSocialError(error);
      errors.push(parsed);
      limitations.push(parsed.message);
    }

    try {
      recentAnalytics = await this.fetchRecentAnalytics(accountId, config.zernioDefaultLimit);
    } catch (error) {
      const parsed = this.toSocialError(error);
      errors.push(parsed);
      limitations.push(parsed.message);
    }

    if (!followerStats && !recentAnalytics) {
      throw errors[0] ?? new SocialAdapterError(
        "Zernio no devolvió analytics utilizables para esta cuenta.",
        { code: "zernio_no_metrics", recoverable: true }
      );
    }

    const fallbackFollowers =
      safeNumber(connectedAccount.currentFollowers) ?? safeNumber(connectedAccount.followers);
    const currentFollowers = followerStats?.currentFollowers ?? fallbackFollowers;
    const engagementRate = recentAnalytics?.engagementRate ?? calculateEngagementRate(
      this.platform,
      recentAnalytics?.averageLikes,
      recentAnalytics?.averageComments,
      this.platform === "youtube" ? recentAnalytics?.averageViews : currentFollowers
    );

    return {
      platform: this.platform,
      accountId,
      username,
      accountName: connectedAccount.displayName ?? connectedAccount.username ?? username,
      displayName: connectedAccount.displayName ?? connectedAccount.username ?? username,
      profileUrl: connectedAccount.profileUrl ?? buildFallbackProfileUrl(this.platform, username),
      avatarUrl: connectedAccount.avatarUrl,
      dateRange: recentAnalytics?.dateRange ?? createDefaultDateRange(),
      followers: this.platform !== "youtube" ? currentFollowers : undefined,
      subscribers: this.platform === "youtube" ? currentFollowers : undefined,
      impressions: recentAnalytics?.impressions,
      reach: recentAnalytics?.reach,
      engagement: recentAnalytics?.engagement,
      likes: recentAnalytics?.likes,
      comments: recentAnalytics?.comments,
      shares: recentAnalytics?.shares,
      saves: recentAnalytics?.saves,
      clicks: recentAnalytics?.clicks,
      averageViews: recentAnalytics?.averageViews,
      averageLikes: recentAnalytics?.averageLikes,
      averageComments: recentAnalytics?.averageComments,
      engagementRate,
      recentContent: recentAnalytics?.recentContent ?? [],
      topPosts: recentAnalytics?.topPosts ?? [],
      growth: followerStats?.growth ?? [],
      lastUpdated: recentAnalytics?.lastUpdated ?? new Date().toISOString(),
      dataSource: "zernio",
      isRealData: true,
      isMock: false,
      warnings: [...limitations],
      limitations,
      rawProvider: "zernio",
    };
  }

  private async requestJson<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const config = getSocialConfig();
    if (!config.zernioApiKey) {
      throw new SocialAdapterError("Falta ZERNIO_API_KEY para consultar Zernio.", {
        code: "zernio_missing_api_key",
        recoverable: true,
      });
    }

    const url = `${config.zernioBaseUrl}${buildZernioPath(path, query)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.zernioApiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    let payload: unknown = {};

    if (text.trim().length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { error: text.slice(0, 200) };
      }
    }

    if (!response.ok) {
      throw classifyZernioError(response.status, payload);
    }

    return payload as T;
  }

  private async findMatchingAccount(username: string): Promise<ZernioAccountRecord | null> {
    const response = await this.requestJson<ZernioAccountsResponse>(ZERNIO_ENDPOINTS.accounts, {
      platform: this.platform,
      status: "connected",
    });

    const desiredHandle = normalizeHandle(username);
    if (!desiredHandle) {
      return null;
    }

    const accounts = extractAccounts(response);
    return accounts.find((account) => normalizeHandle(account.username) === desiredHandle) ?? null;
  }

  private async fetchFollowerStats(accountId: string): Promise<ResolvedFollowerStats> {
    const response = await this.requestJson<ZernioFollowerStatsResponse>(ZERNIO_ENDPOINTS.followerStats, {
      accountIds: accountId,
      granularity: "daily",
    });

    const account =
      response.accounts?.find((item) => getAccountId(item) === accountId) ??
      response.accounts?.[0];

    return {
      currentFollowers: account ? safeNumber(account.currentFollowers) : undefined,
      growth: this.resolveGrowth(response.stats?.[accountId] ?? [], account),
    };
  }

  private resolveGrowth(
    points: ZernioFollowerStatPoint[],
    account?: ZernioFollowerStatsAccount
  ): SocialGrowthSnapshot[] {
    const mapped = points
      .map((point) => ({
        date: point.date,
        followers: this.platform !== "youtube" ? safeNumber(point.followers) : undefined,
        subscribers: this.platform === "youtube" ? safeNumber(point.followers ?? point.subscribers) : undefined,
        views: safeNumber(point.views),
      }))
      .filter((point) => point.followers !== undefined || point.subscribers !== undefined || point.views !== undefined);

    if (mapped.length > 0) {
      return mapped;
    }

    const currentFollowers = account ? safeNumber(account.currentFollowers) : undefined;
    if (currentFollowers === undefined) {
      return [];
    }

    return [{
      date: new Date().toISOString().slice(0, 10),
      followers: this.platform !== "youtube" ? currentFollowers : undefined,
      subscribers: this.platform === "youtube" ? currentFollowers : undefined,
    }];
  }

  private async fetchRecentAnalytics(accountId: string, limit: number): Promise<ResolvedRecentAnalytics> {
    const dateRange = createDefaultDateRange();
    const response = await this.requestJson<ZernioAnalyticsResponse>(ZERNIO_ENDPOINTS.analytics, {
      platform: this.platform,
      accountId,
      source: "all",
      fromDate: dateRange.from.slice(0, 10),
      toDate: dateRange.to.slice(0, 10),
      limit: Math.min(Math.max(limit, 1), 100),
      sortBy: "date",
      order: "desc",
    });

    const posts = extractAnalyticsPosts(response)
      .map((post) => this.mapAnalyticsPost(post, accountId))
      .filter((post): post is SocialContentItem & { lastUpdated?: string } => post !== null);

    const content = posts.map(({ lastUpdated: _lastUpdated, ...item }) => item);
    const { avgViews, avgLikes, avgComments } = calculateAverages(content);
    const likes = content.reduce((sum, item) => sum + (item.likes ?? 0), 0);
    const comments = content.reduce((sum, item) => sum + (item.comments ?? 0), 0);
    const shares = content.reduce((sum, item) => sum + (item.shares ?? 0), 0);
    const saves = content.reduce((sum, item) => sum + (item.saves ?? 0), 0);
    const clicks = content.reduce((sum, item) => sum + (item.clicks ?? 0), 0);
    const impressions = content.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
    const reach = content.reduce((sum, item) => sum + (item.reach ?? 0), 0);

    const latestUpdate = posts
      .map((item) => item.lastUpdated)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      dateRange,
      recentContent: content,
      topPosts: [...content]
        .sort((a, b) => ((b.engagement ?? 0) - (a.engagement ?? 0)))
        .slice(0, 3),
      impressions: impressions || undefined,
      reach: reach || undefined,
      engagement: likes + comments + shares + saves + clicks,
      likes: likes || undefined,
      comments: comments || undefined,
      shares: shares || undefined,
      saves: saves || undefined,
      clicks: clicks || undefined,
      averageViews: avgViews,
      averageLikes: avgLikes,
      averageComments: avgComments,
      lastUpdated: latestUpdate,
    };
  }

  private mapAnalyticsPost(
    post: ZernioAnalyticsPostRecord,
    accountId: string
  ): (SocialContentItem & { lastUpdated?: string }) | null {
    const scoped = pickPlatformAnalytics(post, accountId);
    const analytics = scoped?.analytics ?? post.analytics;
    if (!analytics) {
      return null;
    }

    const title = post.content?.trim();
    return {
      id: scoped?.platformPostId ?? post.platformPostId ?? post.postId,
      title: title && title.length > 0 ? title.slice(0, 120) : undefined,
      url: scoped?.platformPostUrl ?? post.platformPostUrl,
      publishedAt: post.publishedAt ?? post.scheduledFor,
      impressions: safeNumber(analytics.impressions),
      reach: safeNumber(analytics.reach),
      views: safeNumber(analytics.views),
      likes: safeNumber(analytics.likes),
      comments: safeNumber(analytics.comments),
      shares: safeNumber(analytics.shares),
      saves: safeNumber(analytics.saves),
      clicks: safeNumber(analytics.clicks),
      engagement:
        (safeNumber(analytics.likes) ?? 0) +
        (safeNumber(analytics.comments) ?? 0) +
        (safeNumber(analytics.shares) ?? 0) +
        (safeNumber(analytics.saves) ?? 0) +
        (safeNumber(analytics.clicks) ?? 0),
      engagementRate: safeNumber(analytics.engagementRate),
      lastUpdated: analytics.lastUpdated,
    };
  }

  private toSocialError(error: unknown): SocialAdapterError {
    if (error instanceof SocialAdapterError) {
      return error;
    }

    return new SocialAdapterError(String(error), {
      code: "zernio_unknown_error",
      recoverable: true,
    });
  }
}

export const zernioInstagramAdapter = new ZernioPlatformAdapter("instagram");
export const zernioTikTokAdapter = new ZernioPlatformAdapter("tiktok");
export const zernioYouTubeAdapter = new ZernioPlatformAdapter("youtube");
