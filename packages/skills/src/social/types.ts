export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "all";
export type SocialAnalyticsPlatform =
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "facebook"
  | "youtube"
  | "unknown";

export type SocialDataSource =
  | "zernio"
  | "mock"
  | "unavailable"
  | "youtube_api"
  | "instagram_api"
  | "tiktok_api";

export interface SocialDateRange {
  from: string;
  to: string;
}

export interface SocialMetricsRequest {
  platform: SocialPlatform;
  username: string;
  includeRecentContent?: boolean;
  includeAnalysis?: boolean;
}

export interface SocialContentItem {
  id?: string;
  title?: string;
  url?: string;
  publishedAt?: string;
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  profileViews?: number;
  engagement?: number;
  engagementRate?: number;
}

export interface SocialProfileMetrics {
  platform: SocialAnalyticsPlatform;
  username: string;
  accountId?: string;
  accountName?: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  dateRange?: SocialDateRange;
  followers?: number;
  following?: number;
  subscribers?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  profileViews?: number;
  totalPosts?: number;
  totalVideos?: number;
  totalViews?: number;
  totalLikes?: number;
  averageViews?: number;
  averageLikes?: number;
  averageComments?: number;
  engagementRate?: number;
  recentContent?: SocialContentItem[];
  topPosts?: SocialContentItem[];
  growth?: SocialGrowthSnapshot[];
  lastUpdated: string;
  dataSource: SocialDataSource;
  isRealData: boolean;
  isMock: boolean;
  warnings: string[];
  limitations: string[];
  rawProvider?: string;
}

export interface SocialGrowthSnapshot {
  date: string;
  followers?: number;
  subscribers?: number;
  views?: number;
}

export interface SocialMetricsResponse {
  request: SocialMetricsRequest;
  profiles: SocialProfileMetrics[];
  summary: string;
  insights: string[];
  recommendations: string[];
  dataSource: SocialDataSource;
  isMock: boolean;
  contentFocus?: "top_content";
  rankingMetric?: "views" | "impressions" | "engagement";
  warnings: string[];
  unavailable: { platform: string; reason: string }[];
}
