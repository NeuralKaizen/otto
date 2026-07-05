import type { SocialPlatform } from "./types.js";

export interface ParsedSocialRequest {
  platform: SocialPlatform;
  username: string | null;
  queryType: "overview" | "top_content";
}

export interface SocialParserOptions {
  /** Fallback username to use when none is found in the message. */
  fallbackUsername?: string;
  /** Fallback platform to use when none is explicitly mentioned in the message. */
  fallbackPlatform?: SocialPlatform;
}

export function parseSocialRequest(message: string, options?: SocialParserOptions): ParsedSocialRequest {
  const m = message.toLowerCase();

  const mentionsInstagram = m.includes("instagram");
  const mentionsTiktok = m.includes("tiktok");
  const mentionsYoutube = m.includes("youtube");

  let platform: SocialPlatform;
  const platformCount = [mentionsInstagram, mentionsTiktok, mentionsYoutube].filter(Boolean).length;
  const mentionsMultiOrAll =
    platformCount > 1 ||
    m.includes("todas") ||
    m.includes("all") ||
    m.includes("compara") ||
    m.includes("comparar") ||
    m.includes("redes") ||
    m.includes("redes sociales");

  if (mentionsMultiOrAll) {
    platform = "all";
  } else if (mentionsInstagram) {
    platform = "instagram";
  } else if (mentionsTiktok) {
    platform = "tiktok";
  } else if (mentionsYoutube) {
    platform = "youtube";
  } else if (options?.fallbackPlatform) {
    // No platform explicitly mentioned — use session context fallback
    platform = options.fallbackPlatform;
  } else {
    platform = "all";
  }

  const extracted = extractUsername(message);
  const fallback = options?.fallbackUsername ? normalizeUsername(options.fallbackUsername) : null;
  const username = extracted ?? fallback;
  const queryType = isTopContentQuery(message) ? "top_content" : "overview";

  return { platform, username, queryType };
}

export function isTopContentQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("videos más vistos") ||
    normalized.includes("videos mas vistos") ||
    normalized.includes("reels más vistos") ||
    normalized.includes("reels mas vistos") ||
    normalized.includes("publicaciones más vistas") ||
    normalized.includes("publicaciones mas vistas") ||
    normalized.includes("reels con más vistas") ||
    normalized.includes("reels con mas vistas") ||
    normalized.includes("top posts") ||
    normalized.includes("mejores posts") ||
    normalized.includes("contenido con más vistas") ||
    normalized.includes("contenido con mas vistas") ||
    normalized.includes("qué contenido funcionó mejor") ||
    normalized.includes("que contenido funciono mejor")
  );
}

function extractUsername(message: string): string | null {
  const atMatch = message.match(/@([\w.-]+)/);
  if (atMatch) {
    return normalizeUsername(atMatch[1]);
  }

  const instagramMatch = message.match(/instagram\.com\/([^/?#\s]+)/i);
  if (instagramMatch) {
    return normalizeUsername(instagramMatch[1]);
  }

  const tiktokMatch = message.match(/tiktok\.com\/@([^/?#\s]+)/i);
  if (tiktokMatch) {
    return normalizeUsername(tiktokMatch[1]);
  }

  const youtubeHandleMatch = message.match(/youtube\.com\/@([^/?#\s]+)/i);
  if (youtubeHandleMatch) {
    return normalizeUsername(youtubeHandleMatch[1]);
  }

  const youtubeChannelMatch = message.match(/youtube\.com\/channel\/(UC[^/?#\s]+)/i);
  if (youtubeChannelMatch) {
    return youtubeChannelMatch[1];
  }

  const youtubeCustomMatch = message.match(/youtube\.com\/c\/([^/?#\s]+)/i);
  if (youtubeCustomMatch) {
    return normalizeUsername(youtubeCustomMatch[1]);
  }

  return null;
}

export function normalizeUsername(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}
