import type { ComposioConfig } from "./composioConfig.js";
import type { ComposioActionRisk, ComposioPolicyDecision, ComposioToolkit } from "./types.js";

const READ_KEYWORDS = ["get", "list", "search", "query", "retrieve", "find", "fetch"];
const WRITE_KEYWORDS = ["create", "update", "patch", "edit", "move", "assign", "comment"];
const SEND_KEYWORDS = ["send", "invite", "share", "publish"];
const DELETE_KEYWORDS = ["delete", "remove", "archive", "merge"];

/**
 * Heuristic risk classification from an action slug/name, e.g. "GMAIL_SEND_EMAIL" → "send".
 * Checked in order read → write → send → delete so a slug matching multiple
 * categories (rare) resolves to the least-risky interpretation first.
 */
export function classifyActionRisk(actionName: string): ComposioActionRisk {
  const a = actionName.toLowerCase();
  if (READ_KEYWORDS.some((k) => a.includes(k))) return "read";
  if (WRITE_KEYWORDS.some((k) => a.includes(k))) return "write";
  if (SEND_KEYWORDS.some((k) => a.includes(k))) return "send";
  if (DELETE_KEYWORDS.some((k) => a.includes(k))) return "delete";
  return "unknown";
}

export function isToolkitAllowed(toolkit: ComposioToolkit, config: ComposioConfig): boolean {
  return config.allowedToolkits.includes(toolkit);
}

/** Empty COMPOSIO_ALLOWED_ACTIONS means "no extra restriction" — fall back to toolkit allowlist + risk policy. */
export function isActionAllowed(toolkit: ComposioToolkit, action: string, config: ComposioConfig): boolean {
  if (config.allowedActions.length === 0) return true;
  const normalized = action.toLowerCase();
  return (
    config.allowedActions.includes(normalized) ||
    config.allowedActions.includes(`${toolkit}:${normalized}`)
  );
}

/**
 * Whether a human approval is required before this action can run, assuming
 * it is otherwise allowed (toolkit/action allowlisted, not blocked by read-only mode).
 */
export function requiresApproval(toolkit: ComposioToolkit, action: string, config: ComposioConfig): boolean {
  const risk = classifyActionRisk(action);
  if (risk === "read") return false;

  // Always-approval overrides regardless of global config.
  if (toolkit === "gmail" && risk === "send") return true;
  if (toolkit === "googlecalendar" && (risk === "write" || risk === "delete")) return true;
  if (toolkit === "notion" && (risk === "write" || risk === "delete")) return true;
  if (toolkit === "github" && risk === "delete") return true;

  if (risk === "unknown") return true;
  if (config.requireApprovalForWrite) return true;

  return false;
}

/**
 * Full policy evaluation for a single tool call — combines allowlist checks,
 * read-only mode, and approval rules into one decision the skill can act on.
 */
export function evaluatePolicy(toolkit: ComposioToolkit, action: string, config: ComposioConfig): ComposioPolicyDecision {
  const risk = classifyActionRisk(action);

  if (!isToolkitAllowed(toolkit, config)) {
    return {
      allowed: false,
      requiresApproval: false,
      risk,
      blockedReason: `La app "${toolkit}" no está en la lista de herramientas permitidas (COMPOSIO_ALLOWED_TOOLKITS).`,
    };
  }

  if (!isActionAllowed(toolkit, action, config)) {
    return {
      allowed: false,
      requiresApproval: false,
      risk,
      blockedReason: `La acción "${action}" no está en la lista de acciones permitidas (COMPOSIO_ALLOWED_ACTIONS).`,
    };
  }

  // GitHub merge/delete-class actions are always blocked outright — never auto-executed, even with approval.
  if (toolkit === "github" && risk === "delete") {
    return {
      allowed: false,
      requiresApproval: false,
      risk,
      blockedReason: "Las acciones de merge/delete en GitHub están bloqueadas por seguridad y no se ejecutan desde Jarvis.",
    };
  }

  if (config.readOnly && risk !== "read") {
    return {
      allowed: false,
      requiresApproval: false,
      risk,
      blockedReason: "No puedo ejecutar esa acción porque Composio está en modo solo lectura. Puedo buscar información, pero no crear ni modificar datos todavía.",
    };
  }

  return {
    allowed: true,
    requiresApproval: requiresApproval(toolkit, action, config),
    risk,
  };
}
