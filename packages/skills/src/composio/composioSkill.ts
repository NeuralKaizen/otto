import { randomUUID } from "crypto";
import type { ApprovalRequest, SkillPreflightResult } from "@jarvis/shared";
import type { SkillDefinition, SkillContext } from "../types.js";
import type { ComposioActionRisk, ComposioPolicyDecision, ComposioToolkit, ComposioToolRequest, ComposioToolResult } from "./types.js";
import { parseComposioRequest } from "./composioParser.js";
import { getComposioConfig } from "./composioConfig.js";
import { classifyActionRisk, evaluatePolicy } from "./composioPolicy.js";
import { composioMockAdapter } from "./composioMockAdapter.js";
import { composioRealAdapter } from "./composioRealAdapter.js";
import { normalizeNotionResult } from "./normalizers/notionNormalizer.js";
import { normalizeGmailResult } from "./normalizers/gmailNormalizer.js";
import { normalizeCalendarResult } from "./normalizers/calendarNormalizer.js";

interface ComposioSkillInput {
  message: string;
  /** Set by the executor when re-invoking after a user has approved a pending action. */
  approved?: boolean;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = parseInt(process.env.APPROVAL_TIMEOUT_MS ?? "300000", 10);

function mapRiskToLevel(risk: ComposioActionRisk): "low" | "medium" | "high" {
  switch (risk) {
    case "read":
      return "low";
    case "delete":
      return "high";
    case "write":
    case "send":
    case "unknown":
    default:
      return "medium";
  }
}

/**
 * Human-readable description of a pending action, shown in the approval UI.
 * Never includes secrets — `request.params` only ever holds values parsed
 * from the user's own message (e.g. a free-text query).
 */
function buildApprovalDescription(request: ComposioToolRequest, decision: ComposioPolicyDecision, label: string): string {
  const queryNote = typeof request.params.query === "string" ? ` relacionado con "${request.params.query}"` : "";
  const lines = [
    "Jarvis quiere ejecutar una acción externa:",
    "",
    `Toolkit: ${label}`,
    `Action: ${request.action}`,
    `Risk: ${decision.risk}`,
    "",
    `Descripción: Ejecutar "${request.action}" en ${label}${queryNote}.`,
  ];
  if (decision.risk === "write" || decision.risk === "send" || decision.risk === "delete") {
    lines.push("");
    lines.push("Esta acción puede modificar datos externos.");
  }
  return lines.join("\n");
}

export interface ComposioSkillResponse {
  summary: string;
  toolkit?: ComposioToolkit;
  action?: string;
  result?: ComposioToolResult;
  insights: string[];
  limitations: string[];
  enabled: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  source: "composio_api" | "mock" | "none";
}

const TOOLKIT_LABELS: Record<ComposioToolkit, string> = {
  notion: "Notion",
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  slack: "Slack",
  github: "GitHub",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface NormalizedSlackMessages {
  items: Array<{ text: string; user?: string; permalink?: string }>;
}

function normalizeSlackResult(data: unknown): NormalizedSlackMessages {
  if (!isRecord(data)) return { items: [] };
  const messages = data.messages;
  const matches = isRecord(messages) && Array.isArray(messages.matches) ? messages.matches : [];
  return {
    items: matches.filter(isRecord).map((m) => ({
      text: typeof m.text === "string" ? m.text : "",
      user: typeof m.user === "string" ? m.user : undefined,
      permalink: typeof m.permalink === "string" ? m.permalink : undefined,
    })),
  };
}

interface NormalizedGithubIssues {
  items: Array<{ number: number; title: string; state: string; url?: string }>;
}

function normalizeGithubResult(data: unknown): NormalizedGithubIssues {
  if (!isRecord(data)) return { items: [] };
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items: items.filter(isRecord).map((i) => ({
      number: typeof i.number === "number" ? i.number : 0,
      title: typeof i.title === "string" ? i.title : "(sin título)",
      state: typeof i.state === "string" ? i.state : "unknown",
      url: typeof i.html_url === "string" ? i.html_url : undefined,
    })),
  };
}

/** Normalizes a raw Composio `data` payload using the toolkit-appropriate normalizer. */
function normalizeForToolkit(toolkit: ComposioToolkit, data: unknown): unknown {
  switch (toolkit) {
    case "notion":
      return normalizeNotionResult(data);
    case "gmail":
      return normalizeGmailResult(data);
    case "googlecalendar":
      return normalizeCalendarResult(data);
    case "slack":
      return normalizeSlackResult(data);
    case "github":
      return normalizeGithubResult(data);
  }
}

/** Numbered result lines (without header/source) for the read-result summary. */
function formatResultLines(request: ComposioToolRequest, normalized: unknown): string[] {
  const label = TOOLKIT_LABELS[request.toolkit];

  switch (request.toolkit) {
    case "notion": {
      const { items } = normalized as ReturnType<typeof normalizeNotionResult>;
      if (items.length === 0) return [`No encontré resultados en ${label} para esta consulta.`];
      return items.slice(0, 5).map((i, idx) => {
        const parts = [i.title];
        if (i.status) parts.push(i.status);
        if (i.project) parts.push(i.project);
        return `${idx + 1}. ${parts.join(" — ")}`;
      });
    }
    case "gmail": {
      const { emails } = normalized as ReturnType<typeof normalizeGmailResult>;
      const noun = request.action.toUpperCase().includes("DRAFT") ? "borradores" : "correos";
      if (emails.length === 0) return [`No encontré ${noun} en ${label} para esta consulta.`];
      return emails.slice(0, 5).map((e, idx) => `${idx + 1}. ${e.subject ?? "(sin asunto)"} — de ${e.from ?? "desconocido"}`);
    }
    case "googlecalendar": {
      const { events } = normalized as ReturnType<typeof normalizeCalendarResult>;
      if (events.length === 0) return [`No encontré eventos en ${label} para este rango.`];
      return events.slice(0, 5).map((e, idx) => `${idx + 1}. ${e.title ?? "(sin título)"} — ${e.start ?? "sin fecha"}`);
    }
    case "slack": {
      const { items } = normalized as NormalizedSlackMessages;
      if (items.length === 0) return [`No encontré mensajes en ${label} para esta búsqueda.`];
      return items.slice(0, 5).map((i, idx) => `${idx + 1}. ${i.text}`);
    }
    case "github": {
      const { items } = normalized as NormalizedGithubIssues;
      if (items.length === 0) return [`No encontré issues en ${label}.`];
      return items.slice(0, 5).map((i, idx) => `${idx + 1}. #${i.number} ${i.title} (${i.state})`);
    }
  }
}

const STATUS_FILTER_LABELS: Record<string, string> = {
  overdue: "vencidas",
  pending: "pendientes",
  blocked: "bloqueadas",
  completed: "completadas",
};

const DATE_RANGE_LABELS: Record<string, string> = {
  today: "hoy",
  tomorrow: "mañana",
  this_week: "esta semana",
  next_week: "próxima semana",
};

/** Renders the structured filters detected by the parser as a short Spanish phrase (e.g. "el filtro persona: Daniel"). */
function buildFilterDescription(params: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (typeof params.personName === "string") parts.push(`persona: ${params.personName}`);
  if (typeof params.projectName === "string") parts.push(`proyecto: ${params.projectName}`);
  if (typeof params.statusFilter === "string") parts.push(`estado: ${STATUS_FILTER_LABELS[params.statusFilter] ?? params.statusFilter}`);
  if (typeof params.dateRange === "string") parts.push(`fecha: ${DATE_RANGE_LABELS[params.dateRange] ?? params.dateRange}`);
  if (typeof params.senderName === "string") parts.push(`remitente: ${params.senderName}`);
  if (typeof params.recipientName === "string") parts.push(`destinatario: ${params.recipientName}`);
  if (typeof params.subject === "string") parts.push(`asunto: "${params.subject}"`);
  if (typeof params.repoName === "string") parts.push(`repositorio: ${params.repoName}`);
  if (typeof params.status === "string") parts.push(`estado: ${params.status}`);
  if (params.draft === true) parts.push("borradores");
  if (typeof params.eventType === "string") parts.push(`tipo: ${params.eventType}`);
  if (typeof params.limit === "number") parts.push(`límite: ${params.limit}`);

  if (parts.length === 0) return undefined;
  return `el filtro ${parts.join(", ")}`;
}

function buildExecutedSummary(request: ComposioToolRequest, result: ComposioToolResult, normalized: unknown, limitations: string[]): string {
  const label = TOOLKIT_LABELS[request.toolkit];
  const lines: string[] = [];

  if (!result.success) {
    lines.push(`No pude completar la acción "${request.action}" en ${label}: ${result.error?.message ?? "error desconocido"}.`);
  } else if (classifyActionRisk(request.action) === "read") {
    const filters = buildFilterDescription(request.params);
    lines.push(filters ? `Consulté ${label} vía Composio usando ${filters}.` : `Consulté ${label} vía Composio.`);
    lines.push(...formatResultLines(request, normalized));
    lines.push("");
    lines.push(result.source === "mock" ? "Fuente: Composio mock." : "Fuente: Composio real.");
  } else {
    // Write/send/delete actions: confirm execution rather than listing "results".
    lines.push(
      result.source === "mock"
        ? "Acción simulada ejecutada correctamente. Composio está en modo mock o no hay cuenta real conectada."
        : "Acción ejecutada correctamente vía Composio."
    );
  }

  for (const limitation of limitations) lines.push(limitation);

  return lines.join("\n");
}

/**
 * Composio Tool Gateway — executes a small allowlisted set of external-tool
 * actions (Notion, Gmail, Google Calendar, Slack, GitHub) via Composio.
 *
 * Read-only by default: write/send/delete-risk actions are either blocked
 * (COMPOSIO_READ_ONLY_MODE=true) or reported as requiring manual approval —
 * this phase never auto-executes them. Falls back to deterministic mock data
 * whenever Composio is disabled, unconfigured, or the real call fails.
 */
export const composioSkill: SkillDefinition<ComposioSkillInput, ComposioSkillResponse> = {
  name: "composio_tool_gateway",
  description: "Ejecuta herramientas externas permitidas (Notion, Gmail, Google Calendar, Slack, GitHub) a través de Composio con políticas de seguridad: solo lectura por defecto, allowlist de toolkits/acciones, y aprobación requerida para escritura.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["external_tools.composio"],

  async execute(args: ComposioSkillInput, _ctx: SkillContext): Promise<ComposioSkillResponse> {
    const config = getComposioConfig();
    const request = parseComposioRequest(args.message);

    if (!request) {
      const available = config.allowedToolkits.map((t) => TOOLKIT_LABELS[t]).join(", ");
      return {
        summary: `No identifiqué una app externa (Notion, Gmail, Google Calendar, Slack o GitHub) en tu mensaje. Apps disponibles vía Composio: ${available || "ninguna — configura COMPOSIO_ALLOWED_TOOLKITS"}.`,
        insights: [],
        limitations: [],
        enabled: config.enabled,
        blocked: false,
        requiresApproval: false,
        source: "none",
      };
    }

    const decision = evaluatePolicy(request.toolkit, request.action, config);
    const label = TOOLKIT_LABELS[request.toolkit];

    if (!decision.allowed) {
      return {
        summary: decision.blockedReason ?? `La acción "${request.action}" en ${label} está bloqueada por la política de seguridad de Composio.`,
        toolkit: request.toolkit,
        action: request.action,
        insights: [],
        limitations: [],
        enabled: config.enabled,
        blocked: true,
        requiresApproval: false,
        source: "none",
      };
    }

    if (decision.requiresApproval && !args.approved) {
      return {
        summary: `Necesito tu aprobación antes de ejecutar esta acción en ${label}.`,
        toolkit: request.toolkit,
        action: request.action,
        insights: [],
        limitations: [
          "Esta acción requiere aprobación y debe ejecutarse desde la interfaz WebSocket/UI de Jarvis (no vía HTTP GET).",
        ],
        enabled: config.enabled,
        blocked: false,
        requiresApproval: true,
        source: "none",
      };
    }

    const useReal = config.enabled && composioRealAdapter.isAvailable();
    let result = useReal ? await composioRealAdapter.execute(request) : await composioMockAdapter.execute(request);
    const limitations: string[] = [];

    if (!result.success && result.source === "composio_api") {
      if (result.error?.code === "connected_account_not_found") {
        limitations.push(
          `Composio está habilitado, pero no encontré una cuenta de ${label} conectada para ${config.userId}. Usé datos simulados para mantener la prueba funcionando.`
        );
      } else {
        limitations.push(
          `No se pudo ejecutar "${request.action}" vía Composio API (${result.error?.message ?? "error desconocido"}). Mostrando datos simulados.`
        );
      }
      result = await composioMockAdapter.execute(request);
    }

    if (!config.enabled) {
      limitations.push("Composio no está habilitado (ENABLE_COMPOSIO=false) — mostrando datos simulados.");
    } else if (!config.apiKey) {
      limitations.push("Falta COMPOSIO_API_KEY — mostrando datos simulados.");
    }

    const normalized = result.success ? normalizeForToolkit(request.toolkit, result.data) : undefined;
    const summary = buildExecutedSummary(request, result, normalized, limitations);

    return {
      summary,
      toolkit: request.toolkit,
      action: request.action,
      result: { ...result, normalized },
      insights: [],
      limitations,
      enabled: config.enabled,
      blocked: false,
      requiresApproval: false,
      source: result.source,
    };
  },

  /**
   * Evaluates policy for the requested action *before* the executor commits
   * to running it. Returns "requires_approval" only for allowed
   * write/send/delete actions that need a human decision — everything else
   * (no toolkit detected, blocked by allowlist/read-only, already-approved
   * re-execution, or plain read actions) proceeds straight to `execute()`,
   * which already knows how to report those cases on its own.
   */
  async preflight(args: ComposioSkillInput, _ctx: SkillContext): Promise<SkillPreflightResult> {
    if (args.approved) return { status: "proceed" };

    const config = getComposioConfig();
    const request = parseComposioRequest(args.message);
    if (!request) return { status: "proceed" };

    const decision = evaluatePolicy(request.toolkit, request.action, config);
    if (!decision.allowed || !decision.requiresApproval) return { status: "proceed" };

    const label = TOOLKIT_LABELS[request.toolkit];
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DEFAULT_APPROVAL_TIMEOUT_MS).toISOString();
    const paramsPreview: Record<string, unknown> = { ...request.params };
    const description = buildApprovalDescription(request, decision, label);

    const approvalRequest: ApprovalRequest = {
      id: randomUUID(),
      toolName: `${request.toolkit}:${request.action}`,
      summary: description,
      riskLevel: mapRiskToLevel(decision.risk),
      args: paramsPreview,
      createdAt,
      expiresAt,
      skillName: "composio_tool_gateway",
      title: `Ejecutar acción en ${label}`,
      description,
      risk: decision.risk,
      toolkit: request.toolkit,
      action: request.action,
      paramsPreview,
    };

    return {
      status: "requires_approval",
      approvalRequest,
      pendingExecution: {
        skillName: "composio_tool_gateway",
        input: { message: args.message, approved: true },
        risk: decision.risk,
        toolkit: request.toolkit,
        action: request.action,
      },
    };
  },
};
