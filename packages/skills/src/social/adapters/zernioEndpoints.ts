export const ZERNIO_ENDPOINTS = {
  accounts: "/accounts",
  followerStats: "/accounts/follower-stats",
  analytics: "/analytics",
} as const;

export interface ZernioAccountRecord {
  _id?: string;
  id?: string;
  accountId?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  followers?: number | string;
  currentFollowers?: number | string;
}

export interface ZernioAccountsResponse {
  accounts?: ZernioAccountRecord[];
  data?: ZernioAccountRecord[] | { accounts?: ZernioAccountRecord[] };
}

export interface ZernioFollowerStatsAccount {
  _id?: string;
  id?: string;
  accountId?: string;
  platform?: string;
  username?: string;
  currentFollowers?: number | string;
  growth?: number | string;
  growthPercentage?: number | string;
}

export interface ZernioFollowerStatPoint {
  date: string;
  followers?: number | string;
  subscribers?: number | string;
  views?: number | string;
}

export interface ZernioFollowerStatsResponse {
  accounts?: ZernioFollowerStatsAccount[];
  stats?: Record<string, ZernioFollowerStatPoint[]>;
}

export interface ZernioAnalyticsSummary {
  likes?: number | string;
  comments?: number | string;
  shares?: number | string;
  saves?: number | string;
  clicks?: number | string;
  views?: number | string;
  reach?: number | string;
  impressions?: number | string;
  engagementRate?: number | string;
  lastUpdated?: string;
}

export interface ZernioAnalyticsPlatformRecord {
  accountId?: string;
  accountUsername?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  analytics?: ZernioAnalyticsSummary;
}

export interface ZernioAnalyticsPostRecord {
  postId?: string;
  platformPostId?: string;
  content?: string;
  publishedAt?: string;
  scheduledFor?: string;
  platformPostUrl?: string;
  analytics?: ZernioAnalyticsSummary;
  platformAnalytics?: ZernioAnalyticsPlatformRecord[];
}

export interface ZernioAnalyticsResponse {
  posts?: ZernioAnalyticsPostRecord[];
  items?: ZernioAnalyticsPostRecord[];
  data?: ZernioAnalyticsPostRecord[] | { posts?: ZernioAnalyticsPostRecord[]; items?: ZernioAnalyticsPostRecord[] };
}

export function buildZernioPath(
  path: string,
  query: Record<string, string | number | boolean | undefined>
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}
