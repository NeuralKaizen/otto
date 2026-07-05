import { getComposioClient } from "../composio/composioClient.js";
import { composioRealAdapter } from "../composio/composioRealAdapter.js";
import { normalizeNotionResult } from "../composio/normalizers/notionNormalizer.js";
import {
  getNotionWorkspaceConfig,
  setNotionRuntimeState,
  validateNotionWorkspaceConfig,
} from "./notionConfig.js";
import type {
  NotionActionName,
  NotionActionSlugKey,
  NotionActionValidationResult,
  NotionRuntimeMode,
  NotionWorkspaceConfig,
  NotionWorkspaceItem,
  ParsedNotionAction,
} from "./types.js";

type ClientSource = "composio_api" | "mock" | "none";

interface NotionClientResult {
  success: boolean;
  source: ClientSource;
  mode: NotionRuntimeMode;
  items: NotionWorkspaceItem[];
  warnings: string[];
  error?: string;
}

interface NotionActionSpec {
  semanticKey: NotionActionSlugKey;
  candidates: string[];
}

const ACTION_CANDIDATES: Record<NotionActionName, NotionActionSpec> = {
  notion_search: { semanticKey: "search", candidates: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_QUERY_DATABASE"] },
  notion_read_page: { semanticKey: "retrievePage", candidates: ["NOTION_FETCH_ROW", "NOTION_SEARCH_NOTION_PAGE"] },
  notion_create_page: { semanticKey: "createPage", candidates: ["NOTION_CREATE_NOTION_PAGE"] },
  notion_create_task: { semanticKey: "createDatabaseItem", candidates: ["NOTION_INSERT_ROW_DATABASE", "NOTION_CREATE_NOTION_PAGE"] },
  notion_update_page: { semanticKey: "updatePage", candidates: ["NOTION_UPDATE_PAGE", "NOTION_REPLACE_PAGE_CONTENT"] },
  notion_update_task: { semanticKey: "updatePage", candidates: ["NOTION_UPDATE_PAGE", "NOTION_REPLACE_PAGE_CONTENT"] },
};

const VALIDATION_SLUGS: Record<NotionActionSlugKey, string[]> = {
  search: ["NOTION_SEARCH_NOTION_PAGE"],
  retrievePage: ["NOTION_FETCH_ROW", "NOTION_RETRIEVE_A_PAGE", "NOTION_GET_PAGE"],
  queryDatabase: ["NOTION_QUERY_DATABASE"],
  createPage: ["NOTION_CREATE_NOTION_PAGE"],
  createDatabaseItem: ["NOTION_INSERT_ROW_DATABASE", "NOTION_CREATE_NOTION_PAGE"],
  updatePage: ["NOTION_UPDATE_PAGE", "NOTION_REPLACE_PAGE_CONTENT"],
};

function emptyValidation(): Record<NotionActionSlugKey, boolean | null> {
  return {
    search: null,
    retrievePage: null,
    queryDatabase: null,
    createPage: null,
    createDatabaseItem: null,
    updatePage: null,
  };
}

export async function discoverNotionActionSupport(
  config: NotionWorkspaceConfig = getNotionWorkspaceConfig()
): Promise<NotionActionValidationResult> {
  const validation = emptyValidation();
  const warnings: string[] = [];
  const foundSlugs: string[] = [];
  const missingSlugs: string[] = [];

  const client = await getComposioClient(process.env.COMPOSIO_API_KEY);
  if (!client || !config.composioUserId) {
    if (!client) warnings.push("Falta COMPOSIO_API_KEY para hacer discovery de actions de Notion.");
    if (!config.composioUserId) warnings.push("Falta COMPOSIO_USER_ID para verificar la conexión de Notion.");
    return {
      notionConnected: null,
      actionValidation: validation,
      foundSlugs,
      missingSlugs,
      warnings,
    };
  }

  let notionConnected: boolean | null = null;

  try {
    const connections = await client.connectedAccounts.list({
      userIds: [config.composioUserId],
      toolkitSlugs: ["notion"],
    });
    notionConnected = connections.items.some(
      (item) => item.toolkit?.slug?.toLowerCase() === "notion" && item.status === "ACTIVE"
    );
    if (!notionConnected) {
      warnings.push("No encontré una cuenta de Notion conectada en Composio para este usuario.");
    }
  } catch {
    warnings.push("No pude verificar si Notion está conectado en Composio.");
  }

  for (const [key, candidates] of Object.entries(VALIDATION_SLUGS) as Array<[NotionActionSlugKey, string[]]>) {
    let found = false;

    for (const slug of candidates) {
      try {
        const tool = await client.tools.getRawComposioToolBySlug(slug);
        if (tool) {
          found = true;
          foundSlugs.push(slug);
          break;
        }
      } catch {
        missingSlugs.push(slug);
      }
    }

    validation[key] = found;
    if (!found) {
      warnings.push(`No pude validar un action slug real para ${key}.`);
    }
  }

  return {
    notionConnected,
    actionValidation: validation,
    foundSlugs: Array.from(new Set(foundSlugs)),
    missingSlugs: Array.from(new Set(missingSlugs)),
    warnings,
  };
}

function mapNormalizedItems(data: unknown): NotionWorkspaceItem[] {
  return normalizeNotionResult(data).items.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    project: item.project,
    assignee: item.assignee,
    dueDate: item.dueDate,
    url: item.url,
    object: item.object,
  }));
}

function buildMockItems(parsed: ParsedNotionAction): NotionWorkspaceItem[] {
  if (parsed.action === "notion_create_page" || parsed.action === "notion_create_task") {
    return [
      {
        id: `mock-${parsed.action}-1`,
        title: parsed.title ?? parsed.query ?? "Elemento de Notion",
        status: parsed.action === "notion_create_task" ? parsed.status ?? "Pending" : "Created",
        project: parsed.projectName,
        url: "https://notion.so/mock-created-item",
        object: "page",
      },
    ];
  }

  if (parsed.action === "notion_update_page" || parsed.action === "notion_update_task") {
    return [
      {
        id: parsed.pageId ?? "mock-updated-page",
        title: parsed.pageTitle ?? parsed.title ?? parsed.query ?? "Elemento actualizado",
        status: parsed.status ?? "Updated",
        project: parsed.projectName,
        url: "https://notion.so/mock-updated-item",
        object: "page",
      },
    ];
  }

  return [
    {
      id: "mock-notion-task-1",
      title: parsed.query ?? "Tarea pendiente de Wattson",
      status: parsed.wantsPendingTasks ? "Pending" : "In Progress",
      project: parsed.projectName ?? "Wattson",
      assignee: parsed.personName ?? "Equipo",
      dueDate: "2026-06-20",
      url: "https://notion.so/mock-notion-task-1",
      object: "page",
    },
    {
      id: "mock-notion-task-2",
      title: `Seguimiento: ${parsed.query ?? "Proyecto"}`,
      status: "Blocked",
      project: parsed.projectName ?? "Acelera",
      assignee: parsed.personName ?? "Daniel",
      dueDate: "2026-06-22",
      url: "https://notion.so/mock-notion-task-2",
      object: "page",
    },
  ];
}

function pickDatabaseId(parsed: ParsedNotionAction, config: NotionWorkspaceConfig): string | undefined {
  return parsed.databaseId ?? (parsed.action === "notion_create_task" || parsed.wantsPendingTasks ? config.tasksDatabaseId : config.defaultDatabaseId);
}

function buildComposioArguments(parsed: ParsedNotionAction, actionSlug: string, config: NotionWorkspaceConfig): Record<string, unknown> {
  const databaseId = pickDatabaseId(parsed, config);

  switch (parsed.action) {
    case "notion_search":
      if (actionSlug === "NOTION_QUERY_DATABASE" && databaseId) {
        return {
          database_id: databaseId,
        };
      }
      return { query: parsed.query ?? (parsed.wantsRecentPages ? "recent pages" : "Notion") };

    case "notion_read_page":
      if (actionSlug === "NOTION_SEARCH_NOTION_PAGE") {
        return { query: parsed.pageTitle ?? parsed.query ?? "" };
      }
      return {
        page_id: parsed.pageId ?? parsed.pageTitle,
      };

    case "notion_create_page":
      return {
        parent: { page_id: config.defaultParentPageId },
        title: parsed.title ?? "Nueva página de Wattson",
        content: parsed.body ?? parsed.query ?? parsed.title ?? "Creado desde Wattson",
      };

    case "notion_create_task":
      return {
        parent: { database_id: databaseId },
        title: parsed.title ?? parsed.query ?? "Nueva tarea",
        status: parsed.status ?? "Pending",
        content: parsed.body ?? parsed.query ?? parsed.title ?? "Creado desde Wattson",
      };

    case "notion_update_page":
    case "notion_update_task":
      return {
        page_id: parsed.pageId,
        title: parsed.title ?? parsed.pageTitle,
        status: parsed.status,
        content: parsed.body,
      };
  }
}

function requiresParentConfig(parsed: ParsedNotionAction, config: NotionWorkspaceConfig): string | undefined {
  if (parsed.action === "notion_create_page" && !config.defaultParentPageId) {
    return "Falta NOTION_DEFAULT_PARENT_PAGE_ID para crear páginas en Notion.";
  }
  if ((parsed.action === "notion_create_task" || parsed.wantsPendingTasks) && !config.tasksDatabaseId) {
    return "Falta NOTION_TASKS_DATABASE_ID para crear o listar tareas en Notion.";
  }
  if ((parsed.action === "notion_update_page" || parsed.action === "notion_update_task") && !parsed.pageId) {
    return "Necesito el pageId de Notion para actualizar esta página o tarea.";
  }
  return undefined;
}

function filterItems(items: NotionWorkspaceItem[], parsed: ParsedNotionAction): NotionWorkspaceItem[] {
  let filtered = items;

  if (parsed.wantsPendingTasks) {
    filtered = filtered.filter((item) => !item.status || !/\bdone|hech|complet/i.test(item.status));
  }

  if (parsed.projectName) {
    const target = parsed.projectName.toLowerCase();
    filtered = filtered.filter((item) => item.project?.toLowerCase().includes(target) || item.title.toLowerCase().includes(target));
  }

  if (parsed.personName) {
    const target = parsed.personName.toLowerCase();
    filtered = filtered.filter((item) => item.assignee?.toLowerCase().includes(target) || item.title.toLowerCase().includes(target));
  }

  if (parsed.pageTitle) {
    const target = parsed.pageTitle.toLowerCase();
    filtered = filtered.filter((item) => item.title.toLowerCase().includes(target));
  }

  if (parsed.query && parsed.action === "notion_search" && !parsed.wantsPendingTasks) {
    const target = parsed.query.toLowerCase();
    filtered = filtered.filter((item) =>
      item.title.toLowerCase().includes(target) ||
      item.project?.toLowerCase().includes(target) ||
      item.assignee?.toLowerCase().includes(target)
    );
  }

  if (parsed.wantsRecentPages) {
    filtered = filtered.slice(0, 5);
  }

  return filtered;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function executeReal(
  parsed: ParsedNotionAction,
  config: NotionWorkspaceConfig
): Promise<NotionClientResult> {
  const actionSpec = ACTION_CANDIDATES[parsed.action];
  const candidates = actionSpec.candidates;
  const client = await getComposioClient(process.env.COMPOSIO_API_KEY);
  if (!client) {
    return {
      success: false,
      source: "none",
      mode: "unavailable",
      items: [],
      warnings: ["Falta COMPOSIO_API_KEY para ejecutar Notion vía Composio."],
      error: "missing_api_key",
    };
  }

  const warnings: string[] = [];
  const validation = await discoverNotionActionSupport(config);
  warnings.push(...validation.warnings);

  if (validation.notionConnected === false) {
    setNotionRuntimeState("unavailable", warnings, {
      notionConnected: validation.notionConnected,
      actionValidation: validation.actionValidation,
    });
    return {
      success: false,
      source: "none",
      mode: "unavailable",
      items: [],
      warnings,
      error: "notion_not_connected",
    };
  }

  if (validation.actionValidation[actionSpec.semanticKey] === false) {
    setNotionRuntimeState(config.fallbackToMock ? "mock" : "unavailable", warnings, {
      notionConnected: validation.notionConnected,
      actionValidation: validation.actionValidation,
    });
    return {
      success: false,
      source: "none",
      mode: config.fallbackToMock ? "mock" : "unavailable",
      items: [],
      warnings,
      error: "notion_action_unavailable",
    };
  }

  for (const actionSlug of candidates) {
    const args = buildComposioArguments(parsed, actionSlug, config);

    try {
      const response = await client.tools.execute(actionSlug, {
        arguments: args,
        userId: config.composioUserId,
      });

      if (!response.successful) {
        warnings.push(response.error ?? `La acción ${actionSlug} no se pudo ejecutar.`);
        continue;
      }

      const items = filterItems(mapNormalizedItems(response.data), parsed);
      setNotionRuntimeState("real", warnings, {
        notionConnected: validation.notionConnected,
        actionValidation: validation.actionValidation,
      });
      return {
        success: true,
        source: "composio_api",
        mode: "real",
        items,
        warnings,
      };
    } catch (err) {
      warnings.push(safeErrorMessage(err));
    }
  }

  const connectedAccountsCheck = await composioRealAdapter.checkConnectedAccounts();
  if (connectedAccountsCheck !== "not_supported_yet" && connectedAccountsCheck.notion === false && !warnings.some((w) => w.includes("cuenta de Notion conectada"))) {
    warnings.push("No encontré una cuenta de Notion conectada en Composio para este usuario.");
  }

  setNotionRuntimeState(config.fallbackToMock ? "mock" : "unavailable", warnings, {
    notionConnected: validation.notionConnected ?? (connectedAccountsCheck !== "not_supported_yet" ? connectedAccountsCheck.notion : null),
    actionValidation: validation.actionValidation,
  });
  return {
    success: false,
    source: "none",
    mode: config.fallbackToMock ? "mock" : "unavailable",
    items: [],
    warnings,
    error: warnings[0] ?? "notion_action_unavailable",
  };
}

export async function executeDedicatedNotionAction(
  parsed: ParsedNotionAction,
  config: NotionWorkspaceConfig = getNotionWorkspaceConfig()
): Promise<NotionClientResult> {
  const status = validateNotionWorkspaceConfig(config);
  const configError = requiresParentConfig(parsed, config);

  if (!status.enabled) {
    setNotionRuntimeState(config.fallbackToMock ? "mock" : "unavailable", status.warnings);
    return {
      success: false,
      source: config.fallbackToMock ? "mock" : "none",
      mode: config.fallbackToMock ? "mock" : "unavailable",
      items: config.fallbackToMock ? buildMockItems(parsed) : [],
      warnings: status.warnings,
      error: "notion_disabled",
    };
  }

  if (configError) {
    setNotionRuntimeState("unavailable", [configError]);
    return {
      success: false,
      source: "none",
      mode: "unavailable",
      items: [],
      warnings: [configError],
      error: configError,
    };
  }

  if (!status.configured && !config.fallbackToMock) {
    setNotionRuntimeState("unavailable", status.warnings);
    return {
      success: false,
      source: "none",
      mode: "unavailable",
      items: [],
      warnings: status.warnings,
      error: "notion_not_configured",
    };
  }

  if (status.configured) {
    const realResult = await executeReal(parsed, config);
    if (realResult.success || !config.fallbackToMock) {
      return realResult;
    }
  }

  const fallbackWarnings = status.warnings.length > 0 ? status.warnings : ["Notion no está listo en modo real; usando mock."];
  setNotionRuntimeState("mock", fallbackWarnings);

  return {
    success: true,
    source: "mock",
    mode: "mock",
    items: buildMockItems(parsed),
    warnings: fallbackWarnings,
  };
}
