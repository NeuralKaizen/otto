export type ComposioToolkit =
  | "notion"
  | "gmail"
  | "googlecalendar"
  | "slack"
  | "github";

export type ComposioActionRisk = "read" | "write" | "send" | "delete" | "unknown";

export interface ComposioToolRequest {
  toolkit: ComposioToolkit;
  action: string;
  params: Record<string, unknown>;
  userId?: string;
  naturalLanguageGoal?: string;
}

export interface ComposioToolResultError {
  message: string;
  code?: string;
  recoverable: boolean;
}

export interface ComposioToolResult {
  toolkit: ComposioToolkit;
  action: string;
  success: boolean;
  data?: unknown;
  normalized?: unknown;
  error?: ComposioToolResultError;
  source: "composio_api" | "mock";
  requiresApproval?: boolean;
  risk: ComposioActionRisk;
}

export interface ComposioToolDefinition {
  toolkit: ComposioToolkit;
  action: string;
  description: string;
  risk: ComposioActionRisk;
  requiresApproval: boolean;
  enabled: boolean;
}

export interface ComposioPolicyDecision {
  /** False if the toolkit/action is blocked outright and must not be executed. */
  allowed: boolean;
  /** True if execution must pause for a human approval before running. */
  requiresApproval: boolean;
  risk: ComposioActionRisk;
  /** Present when allowed=false, explains why for the user-facing message. */
  blockedReason?: string;
}

export interface ComposioAdapter {
  isAvailable(): boolean;
  execute(request: ComposioToolRequest): Promise<ComposioToolResult>;
}

/**
 * Structured natural-language → Composio request, produced by
 * `parseComposioQuery()`. Carries enough detail (toolkit, action, extracted
 * params, confidence, warnings) for the skill to both call Composio and
 * explain what it understood to the user.
 */
export interface ParsedComposioQuery {
  toolkit: ComposioToolkit;
  action: string;
  params: Record<string, unknown>;
  naturalLanguageGoal: string;
  /** 0-1 heuristic confidence in the toolkit/action detection. */
  confidence: number;
  /** Human-readable notes about ambiguous or assumed parsing decisions. */
  parseWarnings: string[];
}

/** Per-toolkit connected-account status for a Composio user, used by `/composio/status`. */
export type ConnectedAccountsCheck = Record<string, boolean> | "not_supported_yet";
