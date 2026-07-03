export type NotionQueryIntent =
  | "tasks_by_person"
  | "project_status"
  | "overdue_tasks"
  | "blocked_tasks"
  | "tasks_by_project"
  | "daily_task_briefing"
  | "workspace_overview";

export interface NotionProjectIntelligenceRequest {
  rawQuery: string;
  intent: NotionQueryIntent;
  personName?: string;
  projectName?: string;
  status?: string;
  dueRange?: "today" | "this_week" | "overdue" | "upcoming" | "all";
  includeCompleted?: boolean;
}

export interface NormalizedNotionTask {
  id: string;
  title: string;
  status?: string;
  assignees: string[];
  dueDate?: string;
  projectName?: string;
  priority?: string;
  url?: string;
  isCompleted: boolean;
  isBlocked: boolean;
  isOverdue: boolean;
  lastEditedTime?: string;
  dataSource: "notion_api" | "mock";
}

export interface NormalizedNotionProject {
  id: string;
  title: string;
  status?: string;
  owner?: string;
  progress?: number;
  dueDate?: string;
  url?: string;
  taskStats?: {
    total: number;
    completed: number;
    pending: number;
    blocked: number;
    overdue: number;
  };
  lastEditedTime?: string;
  dataSource: "notion_api" | "mock";
}

export interface NotionProjectIntelligenceResponse {
  request: NotionProjectIntelligenceRequest;
  tasks: NormalizedNotionTask[];
  projects: NormalizedNotionProject[];
  summary: string;
  insights: string[];
  recommendations: string[];
  limitations: string[];
  dataSource: "notion_api" | "mock" | "mixed";
}

export interface NotionProjectAdapter {
  isAvailable(): boolean;
  queryTasks(request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionTask[]>;
  queryProjects(request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionProject[]>;
}

export interface TaskSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  blocked: number;
  upcoming: number;
  byAssignee: Record<string, NormalizedNotionTask[]>;
  byProject: Record<string, NormalizedNotionTask[]>;
}

export interface ProjectRisk {
  message: string;
}

export interface ProjectSummary {
  status?: string;
  progress?: number;
  progressLimitation?: string;
  taskStats?: NormalizedNotionProject["taskStats"];
  risks: string[];
}

export type NotionProvider = "composio";
export type NotionRuntimeMode = "real" | "mock" | "unavailable";
export type NotionActionRisk = "read" | "write";

export type NotionActionName =
  | "notion_search"
  | "notion_read_page"
  | "notion_create_page"
  | "notion_create_task"
  | "notion_update_page"
  | "notion_update_task";

export interface NotionWorkspaceConfig {
  enabled: boolean;
  provider: NotionProvider;
  composioEnabled: boolean;
  legacyComposioNotionEnabled: boolean;
  defaultParentPageId?: string;
  defaultDatabaseId?: string;
  tasksDatabaseId?: string;
  readOnlyMode: boolean;
  fallbackToMock: boolean;
  requireApproval: boolean;
  composioConfigured: boolean;
  composioUserId?: string;
  userIdPresent: boolean;
}

export interface NotionWorkspaceStatus {
  enabled: boolean;
  provider: NotionProvider;
  configured: boolean;
  userIdPresent: boolean;
  composioConfigured: boolean;
  defaultParentConfigured: boolean;
  tasksDatabaseConfigured: boolean;
  readOnlyMode: boolean;
  requireApproval: boolean;
  canSearch: boolean;
  canCreatePage: boolean;
  canCreateTask: boolean;
  notionConnected: boolean | null;
  actionValidation: Record<string, boolean | null>;
  lastKnownMode: NotionRuntimeMode | null;
  warnings: string[];
}

export interface NotionRuntimeState {
  lastKnownMode?: NotionRuntimeMode;
  notionConnected?: boolean | null;
  actionValidation?: Record<string, boolean | null>;
  warnings: string[];
  checkedAt?: string;
}

export interface ParsedNotionAction {
  action: NotionActionName;
  risk: NotionActionRisk;
  rawQuery: string;
  query?: string;
  title?: string;
  body?: string;
  status?: string;
  pageId?: string;
  pageTitle?: string;
  databaseId?: string;
  projectName?: string;
  personName?: string;
  wantsPendingTasks?: boolean;
  wantsRecentPages?: boolean;
}

export interface NotionWorkspaceItem {
  id: string;
  title: string;
  status?: string;
  project?: string;
  assignee?: string;
  dueDate?: string;
  url?: string;
  object?: string;
}

export interface NotionWorkspaceResponse {
  provider: NotionProvider;
  action: NotionActionName;
  risk: NotionActionRisk;
  summary: string;
  items: NotionWorkspaceItem[];
  insights: string[];
  limitations: string[];
  warnings: string[];
  enabled: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  source: "composio_api" | "mock" | "none";
  mode: NotionRuntimeMode;
}

export type NotionActionSlugKey =
  | "search"
  | "retrievePage"
  | "queryDatabase"
  | "createPage"
  | "createDatabaseItem"
  | "updatePage";

export interface NotionActionValidationResult {
  notionConnected: boolean | null;
  actionValidation: Record<NotionActionSlugKey, boolean | null>;
  foundSlugs: string[];
  missingSlugs: string[];
  warnings: string[];
}
