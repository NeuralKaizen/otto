export function safeDivide(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined || b === 0) return undefined;
  return a / b;
}

export function calculateEngagementRate(
  platform: "instagram" | "tiktok" | "youtube",
  avgLikes: number | undefined,
  avgComments: number | undefined,
  reach: number | undefined
): number | undefined {
  if (avgLikes === undefined && avgComments === undefined) return undefined;
  if (reach === undefined || reach === 0) return undefined;

  const interaction = (avgLikes ?? 0) + (avgComments ?? 0);

  if (platform === "youtube") {
    // For YouTube: (likes + comments) / avgViews * 100
    return parseFloat(((interaction / reach) * 100).toFixed(2));
  }
  // Instagram/TikTok: (likes + comments) / followers * 100
  return parseFloat(((interaction / reach) * 100).toFixed(2));
}

export function calculateAverages(items: Array<{ views?: number; likes?: number; comments?: number }>): {
  avgViews: number | undefined;
  avgLikes: number | undefined;
  avgComments: number | undefined;
} {
  if (items.length === 0) return { avgViews: undefined, avgLikes: undefined, avgComments: undefined };

  const hasViews = items.some((i) => i.views !== undefined);
  const hasLikes = items.some((i) => i.likes !== undefined);
  const hasComments = items.some((i) => i.comments !== undefined);

  return {
    avgViews: hasViews
      ? Math.round(items.reduce((s, i) => s + (i.views ?? 0), 0) / items.length)
      : undefined,
    avgLikes: hasLikes
      ? Math.round(items.reduce((s, i) => s + (i.likes ?? 0), 0) / items.length)
      : undefined,
    avgComments: hasComments
      ? Math.round(items.reduce((s, i) => s + (i.comments ?? 0), 0) / items.length)
      : undefined,
  };
}

export function formatLargeNumber(n: number | undefined): string {
  if (n === undefined) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function scoreAccountHealth(engagementRate: number | undefined, platform: string): string {
  if (engagementRate === undefined) return "unknown";
  if (platform === "youtube") {
    if (engagementRate >= 5) return "excellent";
    if (engagementRate >= 2) return "good";
    if (engagementRate >= 0.5) return "average";
    return "low";
  }
  // Instagram/TikTok benchmarks
  if (engagementRate >= 6) return "excellent";
  if (engagementRate >= 3) return "good";
  if (engagementRate >= 1) return "average";
  return "low";
}
