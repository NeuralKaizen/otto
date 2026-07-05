const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface SocialSessionContentItem {
  id?: string;
  platform?: string;
  title?: string;
  url?: string;
  publishedAt?: string;
  views?: number;
  impressions?: number;
  engagement?: number;
}

export interface SocialSessionContext {
  platform: string;
  username: string;
  summary: string;
  dataSource: string;
  lastToolName: string;
  topPosts: SocialSessionContentItem[];
  recentContent: SocialSessionContentItem[];
  warnings: string[];
  timestamp: string;
}

export interface SessionContextSnapshot {
  conversationId: string;
  hasSocialContext: boolean;
  lastUsername?: string;
  lastPlatform?: string;
  lastToolName?: string;
  dataSource?: string;
  updatedAt?: string;
}

interface SessionEntry {
  social?: SocialSessionContext;
  expiresAt: number;
}

const registry = new Map<string, SessionEntry>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of registry) {
    if (v.expiresAt < now) registry.delete(k);
  }
}

export function setSocialContext(conversationId: string, ctx: SocialSessionContext): void {
  prune();
  const existing = registry.get(conversationId);
  registry.set(conversationId, {
    ...existing,
    social: ctx,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getSocialContext(conversationId: string): SocialSessionContext | undefined {
  prune();
  return registry.get(conversationId)?.social;
}

export function getSessionContextSnapshot(conversationId: string): SessionContextSnapshot {
  const social = getSocialContext(conversationId);

  return {
    conversationId,
    hasSocialContext: Boolean(social),
    lastUsername: social?.username,
    lastPlatform: social?.platform,
    lastToolName: social?.lastToolName,
    dataSource: social?.dataSource,
    updatedAt: social?.timestamp,
  };
}

export function clearSessionContext(conversationId: string): void {
  registry.delete(conversationId);
}

/** Exposed for tests only — resets the entire registry. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
