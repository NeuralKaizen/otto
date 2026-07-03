import { randomUUID } from "crypto";
import type { ApprovalRequest, SkillPreflightResult } from "@wattson/shared";
import type { SkillContext, SkillDefinition } from "../types.js";
import { executeDedicatedNotionAction } from "./notionComposioClient.js";
import { getNotionWorkspaceConfig } from "./notionConfig.js";
import { parseNotionAction } from "./notionActionParser.js";
import type {
  NotionActionName,
  NotionWorkspaceItem,
  NotionWorkspaceResponse,
  ParsedNotionAction,
} from "./types.js";

interface NotionWorkspaceSkillInput {
  message: string;
  approved?: boolean;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = parseInt(process.env.APPROVAL_TIMEOUT_MS ?? "300000", 10);

const ACTION_LABELS: Record<NotionActionName, string> = {
  notion_search: "search",
  notion_read_page: "read",
  notion_create_page: "create page",
  notion_create_task: "create task",
  notion_update_page: "update page",
  notion_update_task: "update task",
};

function summarizeItems(items: NotionWorkspaceItem[], fallback: string): string[] {
  if (items.length === 0) return [fallback];
  return items.slice(0, 5).map((item, index) => {
    const parts = [item.title];
    if (item.status) parts.push(item.status);
    if (item.project) parts.push(item.project);
    return `${index + 1}. ${parts.join(" — ")}`;
  });
}

function buildApprovalDescription(parsed: ParsedNotionAction): string {
  const action = ACTION_LABELS[parsed.action];
  const detail = parsed.title ?? parsed.query ?? parsed.pageTitle ?? "elemento de Notion";
  return [
    "Wattson quiere ejecutar una acción en Notion:",
    "",
    `Action: ${action}`,
    `Detalle: ${detail}`,
    "",
    "Esta acción puede modificar datos externos en Notion.",
  ].join("\n");
}

function buildBlockedResponse(parsed: ParsedNotionAction): NotionWorkspaceResponse {
  return {
    provider: "composio",
    action: parsed.action,
    risk: parsed.risk,
    summary: "No puedo ejecutar esa acción porque Notion está en modo solo lectura. Puedo buscar información, pero no crear ni modificar datos todavía.",
    items: [],
    insights: [],
    limitations: ["NOTION_READ_ONLY_MODE=true o COMPOSIO_READ_ONLY_MODE=true están bloqueando acciones de escritura."],
    warnings: ["Notion está en modo solo lectura."],
    enabled: true,
    blocked: true,
    requiresApproval: false,
    source: "none",
    mode: "unavailable",
  };
}

function buildApprovalPendingResponse(parsed: ParsedNotionAction): NotionWorkspaceResponse {
  return {
    provider: "composio",
    action: parsed.action,
    risk: parsed.risk,
    summary: "Necesito tu aprobación antes de ejecutar esta acción en Notion.",
    items: [],
    insights: [],
    limitations: ["La acción quedó pendiente y solo debe ejecutarse una vez después de aprobarla."],
    warnings: [],
    enabled: true,
    blocked: false,
    requiresApproval: true,
    source: "none",
    mode: "unavailable",
  };
}

function buildReadSummary(parsed: ParsedNotionAction, items: NotionWorkspaceItem[], source: "composio_api" | "mock", warnings: string[]): string {
  const sourceLabel = source === "composio_api" ? "Fuente: Notion vía Composio." : "Fuente: Mock de Notion.";
  const lines: string[] = [];

  if (parsed.wantsPendingTasks) {
    lines.push(`Consulté Notion y encontré ${items.length} tareas relevantes.`);
  } else if (parsed.wantsRecentPages) {
    lines.push(`Consulté Notion y recuperé ${items.length} páginas recientes o relacionadas.`);
  } else {
    lines.push(`Consulté Notion y encontré ${items.length} resultados.`);
  }

  lines.push(...summarizeItems(items, "No encontré resultados relevantes en Notion para esta consulta."));
  lines.push("");
  lines.push(sourceLabel);

  if (warnings[0]) lines.push(`Nota: ${warnings[0]}`);
  return lines.join("\n");
}

function buildWriteSummary(parsed: ParsedNotionAction, items: NotionWorkspaceItem[], source: "composio_api" | "mock", warnings: string[]): string {
  const target = items[0]?.title ?? parsed.title ?? parsed.query ?? "elemento";
  const sourceLabel = source === "composio_api" ? "Fuente: Notion vía Composio." : "Fuente: Mock de Notion.";
  const verb = parsed.action === "notion_create_page" || parsed.action === "notion_create_task" ? "creado" : "actualizado";
  const lines = [`Elemento ${verb} en Notion: ${target}.`, sourceLabel];
  if (warnings[0]) lines.push(`Nota: ${warnings[0]}`);
  return lines.join("\n");
}

export const notionWorkspaceSkill: SkillDefinition<NotionWorkspaceSkillInput, NotionWorkspaceResponse> = {
  name: "notion_workspace_assistant",
  description: "Skill dedicada de Notion con acciones explícitas de search/read/create/update vía Composio, sin depender del gateway genérico.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["notion.read", "notion.write"],

  async execute(args: NotionWorkspaceSkillInput, _ctx: SkillContext): Promise<NotionWorkspaceResponse> {
    const config = getNotionWorkspaceConfig();
    const parsed = parseNotionAction(args.message);

    if (parsed.risk === "write" && config.readOnlyMode) {
      return buildBlockedResponse(parsed);
    }

    if (parsed.risk === "write" && config.requireApproval && !args.approved) {
      return buildApprovalPendingResponse(parsed);
    }

    const result = await executeDedicatedNotionAction(parsed, config);

    if (!result.success && result.source === "none") {
      return {
        provider: "composio",
        action: parsed.action,
        risk: parsed.risk,
        summary: result.warnings[0] ?? "No pude completar la acción dedicada de Notion.",
        items: [],
        insights: [],
        limitations: result.warnings,
        warnings: result.warnings,
        enabled: config.enabled,
        blocked: false,
        requiresApproval: false,
        source: "none",
        mode: result.mode,
      };
    }

    const summary = parsed.risk === "read"
      ? buildReadSummary(parsed, result.items, result.source === "none" ? "mock" : result.source, result.warnings)
      : buildWriteSummary(parsed, result.items, result.source === "none" ? "mock" : result.source, result.warnings);

    return {
      provider: "composio",
      action: parsed.action,
      risk: parsed.risk,
      summary,
      items: result.items,
      insights: [],
      limitations: result.warnings,
      warnings: result.warnings,
      enabled: config.enabled,
      blocked: false,
      requiresApproval: false,
      source: result.source === "none" ? "mock" : result.source,
      mode: result.mode,
    };
  },

  async preflight(args: NotionWorkspaceSkillInput): Promise<SkillPreflightResult> {
    if (args.approved) return { status: "proceed" };

    const config = getNotionWorkspaceConfig();
    const parsed = parseNotionAction(args.message);

    if (parsed.risk !== "write" || config.readOnlyMode || !config.requireApproval) {
      return { status: "proceed" };
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DEFAULT_APPROVAL_TIMEOUT_MS).toISOString();
    const description = buildApprovalDescription(parsed);
    const approvalRequest: ApprovalRequest = {
      id: randomUUID(),
      toolName: `notion:${parsed.action}`,
      summary: description,
      riskLevel: "medium",
      args: {
        action: parsed.action,
        title: parsed.title,
        query: parsed.query,
        pageId: parsed.pageId,
        status: parsed.status,
      },
      createdAt,
      expiresAt,
      skillName: "notion_workspace_assistant",
      title: "Ejecutar acción en Notion",
      description,
      risk: "write",
      toolkit: "notion",
      action: parsed.action,
      paramsPreview: {
        action: parsed.action,
        title: parsed.title,
        query: parsed.query,
        pageId: parsed.pageId,
        status: parsed.status,
      },
    };

    return {
      status: "requires_approval",
      approvalRequest,
      pendingExecution: {
        skillName: "notion_workspace_assistant",
        input: { message: args.message, approved: true },
        risk: "write",
        toolkit: "notion",
        action: parsed.action,
      },
    };
  },
};
