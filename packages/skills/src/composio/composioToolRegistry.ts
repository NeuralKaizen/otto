import type { ComposioConfig } from "./composioConfig.js";
import type { ComposioActionRisk, ComposioToolDefinition, ComposioToolkit } from "./types.js";
import { classifyActionRisk } from "./composioPolicy.js";

/**
 * Curated catalog of Composio actions Wattson knows how to call and mock.
 *
 * Action slugs follow Composio's `TOOLKIT_VERB_NOUN` convention. These are the
 * commonly published slugs for each toolkit as of this writing — if the real
 * adapter is enabled and a slug has changed upstream, `composio.tools.get()`
 * can be used to re-verify it before calling `execute()`.
 */
const TOOL_DEFINITIONS: ComposioToolDefinition[] = [
  // Notion
  {
    toolkit: "notion",
    action: "NOTION_SEARCH_NOTION_PAGE",
    description: "Buscar páginas y bases de datos en Notion por texto.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "notion",
    action: "NOTION_QUERY_DATABASE",
    description: "Consultar filas de una base de datos de Notion.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "notion",
    action: "NOTION_CREATE_NOTION_PAGE",
    description: "Crear una página o tarea nueva en Notion.",
    risk: "write",
    requiresApproval: true,
    enabled: true,
  },
  {
    toolkit: "notion",
    action: "NOTION_UPDATE_PAGE",
    description: "Actualizar una página existente en Notion.",
    risk: "write",
    requiresApproval: true,
    enabled: true,
  },

  // Gmail
  {
    toolkit: "gmail",
    action: "GMAIL_FETCH_EMAILS",
    description: "Buscar y listar correos recientes en Gmail.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "gmail",
    action: "GMAIL_LIST_DRAFTS",
    description: "Listar borradores existentes en Gmail.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "gmail",
    action: "GMAIL_SEND_EMAIL",
    description: "Enviar un correo desde Gmail.",
    risk: "send",
    requiresApproval: true,
    enabled: true,
  },

  // Google Calendar
  {
    toolkit: "googlecalendar",
    action: "GOOGLECALENDAR_FIND_EVENT",
    description: "Listar eventos del calendario en un rango de fechas.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "googlecalendar",
    action: "GOOGLECALENDAR_CREATE_EVENT",
    description: "Crear un evento nuevo en Google Calendar.",
    risk: "write",
    requiresApproval: true,
    enabled: true,
  },

  // Slack
  {
    toolkit: "slack",
    action: "SLACK_SEARCH_MESSAGES",
    description: "Buscar mensajes en Slack por texto.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },

  // GitHub
  {
    toolkit: "github",
    action: "GITHUB_LIST_REPOSITORY_ISSUES",
    description: "Listar issues de un repositorio de GitHub.",
    risk: "read",
    requiresApproval: false,
    enabled: true,
  },
  {
    toolkit: "github",
    action: "GITHUB_MERGE_PULL_REQUEST",
    description: "Hacer merge de un pull request en GitHub.",
    risk: "delete",
    requiresApproval: true,
    enabled: true,
  },
];

/** All registered tool definitions, regardless of current config. */
export function getAllToolDefinitions(): ComposioToolDefinition[] {
  return TOOL_DEFINITIONS;
}

/** Tool definitions filtered down to toolkits allowed by the current config. */
export function listAvailableTools(config: ComposioConfig): ComposioToolDefinition[] {
  return TOOL_DEFINITIONS.filter((tool) => tool.enabled && config.allowedToolkits.includes(tool.toolkit));
}

/** Looks up a registered definition, recomputing its risk from the live policy heuristic. */
export function findToolDefinition(toolkit: ComposioToolkit, action: string): ComposioToolDefinition | undefined {
  const def = TOOL_DEFINITIONS.find(
    (t) => t.toolkit === toolkit && t.action.toLowerCase() === action.toLowerCase()
  );
  if (!def) return undefined;
  return { ...def, risk: classifyActionRisk(def.action) };
}

/** The default "list/search" action Wattson uses for a toolkit when a request doesn't name a specific action. */
export function defaultReadAction(toolkit: ComposioToolkit): ComposioToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.toolkit === toolkit && t.risk === "read" && t.enabled);
}

/** The default "create" action Wattson uses for a toolkit when a write request doesn't name a specific action. */
export function defaultWriteAction(toolkit: ComposioToolkit): ComposioToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.toolkit === toolkit && t.risk !== "read" && t.enabled);
}

/** The first enabled action registered for a toolkit matching a specific risk level (e.g. "write", "send", "delete"). */
export function findActionForRisk(toolkit: ComposioToolkit, risk: ComposioActionRisk): ComposioToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.toolkit === toolkit && t.risk === risk && t.enabled);
}

/** All enabled, non-read actions registered for a toolkit, in registry order. */
export function nonReadActions(toolkit: ComposioToolkit): ComposioToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => t.toolkit === toolkit && t.risk !== "read" && t.enabled);
}
