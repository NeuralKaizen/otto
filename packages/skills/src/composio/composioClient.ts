import type { Composio as ComposioClient } from "@composio/core";

let cachedClient: ComposioClient | null = null;
let cachedApiKey: string | null = null;

/**
 * Lazily constructs and caches the Composio SDK client. Returns null when no
 * API key is configured — callers must fall back to the mock adapter in that
 * case. The key is never logged.
 */
export async function getComposioClient(apiKey: string | undefined): Promise<ComposioClient | null> {
  if (!apiKey) return null;
  if (cachedClient && cachedApiKey === apiKey) return cachedClient;

  const { Composio } = await import("@composio/core");
  cachedClient = new Composio({ apiKey });
  cachedApiKey = apiKey;
  return cachedClient;
}
