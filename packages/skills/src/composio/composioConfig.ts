import type { ComposioToolkit } from "./types.js";

export interface ComposioConfig {
  enabled: boolean;
  apiKey?: string;
  userId: string;
  readOnly: boolean;
  requireApprovalForWrite: boolean;
  allowedToolkits: ComposioToolkit[];
  /** Empty array means "no extra restriction — use the policy's safe defaults". */
  allowedActions: string[];
  notionEnabled: boolean;
}

const ALL_TOOLKITS: ComposioToolkit[] = ["notion", "gmail", "googlecalendar", "slack", "github"];

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function isComposioToolkit(value: string): value is ComposioToolkit {
  return (ALL_TOOLKITS as string[]).includes(value);
}

export function getComposioConfig(): ComposioConfig {
  const allowedToolkits = parseList(env("COMPOSIO_ALLOWED_TOOLKITS")).filter(isComposioToolkit);

  return {
    enabled: process.env.ENABLE_COMPOSIO === "true",
    apiKey: env("COMPOSIO_API_KEY"),
    userId: env("COMPOSIO_USER_ID") ?? "local-user",
    readOnly: process.env.COMPOSIO_READ_ONLY_MODE !== "false",
    requireApprovalForWrite: process.env.COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE !== "false",
    // Default to a safe empty allowlist — toolkits must be explicitly opted in.
    allowedToolkits: allowedToolkits.length > 0 ? allowedToolkits : ["notion", "gmail", "googlecalendar"],
    allowedActions: parseList(env("COMPOSIO_ALLOWED_ACTIONS")),
    notionEnabled: process.env.ENABLE_COMPOSIO_NOTION === "true",
  };
}

/** True only when Composio is enabled and an API key is configured. Used for health reporting — never logs the key. */
export function isComposioRealAdapterAvailable(config: ComposioConfig = getComposioConfig()): boolean {
  return config.enabled && Boolean(config.apiKey);
}
