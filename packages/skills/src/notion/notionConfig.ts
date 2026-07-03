import type { NotionRuntimeMode, NotionRuntimeState, NotionWorkspaceConfig, NotionWorkspaceStatus } from "./types.js";

export interface NotionTaskPropertyMap {
  title: string;
  status: string;
  assignee: string;
  dueDate: string;
  project: string;
  priority: string;
}

export interface NotionProjectPropertyMap {
  title: string;
  status: string;
  owner: string;
  progress: string;
  dueDate: string;
}

export interface NotionConfig {
  enabled: boolean;
  apiKey?: string;
  tasksDatabaseId?: string;
  projectsDatabaseId?: string;
  taskProperties: NotionTaskPropertyMap;
  projectProperties: NotionProjectPropertyMap;
}

let notionRuntimeState: NotionRuntimeState = {
  warnings: [],
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseNotionEnvBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  const t = raw.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  return defaultValue;
}

export function getNotionConfig(): NotionConfig {
  return {
    enabled: parseNotionEnvBoolean("ENABLE_NOTION", false),
    apiKey: env("NOTION_API_KEY"),
    tasksDatabaseId: env("NOTION_TASKS_DATABASE_ID"),
    projectsDatabaseId: env("NOTION_PROJECTS_DATABASE_ID"),
    taskProperties: {
      title: env("NOTION_TASK_TITLE_PROPERTY") ?? "Name",
      status: env("NOTION_TASK_STATUS_PROPERTY") ?? "Status",
      assignee: env("NOTION_TASK_ASSIGNEE_PROPERTY") ?? "Assignee",
      dueDate: env("NOTION_TASK_DUE_DATE_PROPERTY") ?? "Due",
      project: env("NOTION_TASK_PROJECT_PROPERTY") ?? "Project",
      priority: env("NOTION_TASK_PRIORITY_PROPERTY") ?? "Priority",
    },
    projectProperties: {
      title: env("NOTION_PROJECT_TITLE_PROPERTY") ?? "Name",
      status: env("NOTION_PROJECT_STATUS_PROPERTY") ?? "Status",
      owner: env("NOTION_PROJECT_OWNER_PROPERTY") ?? "Owner",
      progress: env("NOTION_PROJECT_PROGRESS_PROPERTY") ?? "Progress",
      dueDate: env("NOTION_PROJECT_DUE_DATE_PROPERTY") ?? "Due",
    },
  };
}

/** True only when Notion is enabled, has an API key, and a tasks database is configured. */
export function isNotionTasksAvailable(config: NotionConfig = getNotionConfig()): boolean {
  return config.enabled && Boolean(config.apiKey) && Boolean(config.tasksDatabaseId);
}

/** True only when Notion is enabled, has an API key, and a projects database is configured. */
export function isNotionProjectsAvailable(config: NotionConfig = getNotionConfig()): boolean {
  return config.enabled && Boolean(config.apiKey) && Boolean(config.projectsDatabaseId);
}

/** True when Notion is enabled with an API key, regardless of which databases are configured. Used for health reporting only — never logs the key. */
export function isNotionRealAdapterAvailable(config: NotionConfig = getNotionConfig()): boolean {
  return config.enabled && Boolean(config.apiKey);
}

export function getNotionWorkspaceConfig(): NotionWorkspaceConfig {
  const provider = (env("NOTION_PROVIDER") ?? "composio").toLowerCase();
  const fallbackApproval = parseNotionEnvBoolean("COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE", true);
  const fallbackReadOnly = parseNotionEnvBoolean("COMPOSIO_READ_ONLY_MODE", true);
  const legacyComposioNotionEnabled = parseNotionEnvBoolean("ENABLE_COMPOSIO_NOTION", false);
  const enabled = parseNotionEnvBoolean("ENABLE_NOTION", legacyComposioNotionEnabled);
  const composioEnabled = parseNotionEnvBoolean("ENABLE_COMPOSIO", false);
  const composioUserId = env("COMPOSIO_USER_ID");

  return {
    enabled,
    provider: provider === "composio" ? "composio" : "composio",
    composioEnabled,
    legacyComposioNotionEnabled,
    defaultParentPageId: env("NOTION_DEFAULT_PARENT_PAGE_ID"),
    defaultDatabaseId: env("NOTION_DEFAULT_DATABASE_ID"),
    tasksDatabaseId: env("NOTION_TASKS_DATABASE_ID"),
    readOnlyMode: parseNotionEnvBoolean("NOTION_READ_ONLY_MODE", fallbackReadOnly),
    fallbackToMock: parseNotionEnvBoolean("NOTION_FALLBACK_TO_MOCK", false),
    requireApproval: parseNotionEnvBoolean("REQUIRE_APPROVAL", fallbackApproval),
    composioConfigured: composioEnabled && Boolean(env("COMPOSIO_API_KEY")) && Boolean(composioUserId),
    composioUserId,
    userIdPresent: Boolean(composioUserId),
  };
}

export function validateNotionWorkspaceConfig(
  config: NotionWorkspaceConfig = getNotionWorkspaceConfig()
): NotionWorkspaceStatus {
  const warnings: string[] = [];

  if (!config.enabled) {
    warnings.push("Notion está desactivado (ENABLE_NOTION=false).");
  }

  if (config.legacyComposioNotionEnabled) {
    warnings.push("ENABLE_COMPOSIO_NOTION=true detectado como alias legacy. El nombre canónico es ENABLE_NOTION=true.");
  }

  if (!config.composioEnabled) {
    warnings.push("Composio está desactivado (ENABLE_COMPOSIO=false), así que Notion dedicado no puede usar el modo real.");
  }

  if (!config.composioConfigured) {
    if (!env("COMPOSIO_API_KEY")) {
      warnings.push("Falta COMPOSIO_API_KEY para ejecutar Notion vía Composio.");
    }
    if (!config.userIdPresent) {
      warnings.push("Falta COMPOSIO_USER_ID para ejecutar Notion vía Composio.");
    }
  }

  if (!config.defaultParentPageId) {
    warnings.push("NOTION_DEFAULT_PARENT_PAGE_ID no está configurado. Crear páginas nuevas requerirá indicar un parent o usar mock.");
  }

  if (!config.tasksDatabaseId) {
    warnings.push("NOTION_TASKS_DATABASE_ID no está configurado. Crear tareas o listar pendientes usará búsqueda general o fallback.");
  }

  if (config.readOnlyMode) {
    warnings.push("Notion está en modo solo lectura. Las acciones de escritura están bloqueadas.");
  }

  if (config.requireApproval && !config.readOnlyMode) {
    warnings.push("Las acciones de escritura en Notion requieren aprobación antes de ejecutarse.");
  }

  const configured = config.enabled && config.provider === "composio" && config.composioEnabled && config.composioConfigured;
  const mode: NotionRuntimeMode = configured ? "real" : config.fallbackToMock ? "mock" : "unavailable";

  return {
    enabled: config.enabled,
    provider: config.provider,
    configured,
    userIdPresent: config.userIdPresent,
    composioConfigured: config.composioConfigured,
    defaultParentConfigured: Boolean(config.defaultParentPageId),
    tasksDatabaseConfigured: Boolean(config.tasksDatabaseId),
    readOnlyMode: config.readOnlyMode,
    requireApproval: config.requireApproval,
    canSearch: configured,
    canCreatePage: configured && !config.readOnlyMode && Boolean(config.defaultParentPageId),
    canCreateTask: configured && !config.readOnlyMode && Boolean(config.tasksDatabaseId),
    notionConnected: notionRuntimeState.notionConnected ?? null,
    actionValidation: notionRuntimeState.actionValidation ?? {
      search: null,
      retrievePage: null,
      queryDatabase: null,
      createPage: null,
      createDatabaseItem: null,
      updatePage: null,
    },
    lastKnownMode: notionRuntimeState.lastKnownMode ?? null,
    warnings,
  };
}

export function setNotionRuntimeState(
  mode: NotionRuntimeMode,
  warnings: string[] = [],
  extras?: Pick<NotionRuntimeState, "notionConnected" | "actionValidation">
): void {
  notionRuntimeState = {
    lastKnownMode: mode,
    notionConnected: extras?.notionConnected ?? notionRuntimeState.notionConnected,
    actionValidation: extras?.actionValidation ?? notionRuntimeState.actionValidation,
    warnings: [...warnings],
    checkedAt: new Date().toISOString(),
  };
}

export function getNotionRuntimeState(): NotionRuntimeState {
  return {
    lastKnownMode: notionRuntimeState.lastKnownMode,
    notionConnected: notionRuntimeState.notionConnected,
    actionValidation: notionRuntimeState.actionValidation,
    warnings: [...notionRuntimeState.warnings],
    checkedAt: notionRuntimeState.checkedAt,
  };
}

export function resetNotionRuntimeState(): void {
  notionRuntimeState = { warnings: [] };
}
