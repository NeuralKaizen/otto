import type {
  NormalizedNotionProject,
  NormalizedNotionTask,
  NotionProjectAdapter,
  NotionProjectIntelligenceRequest,
} from "../types.js";
import { getNotionConfig, isNotionTasksAvailable, isNotionProjectsAvailable } from "../notionConfig.js";
import { queryDatabasePages, NotionQueryError } from "../notionClient.js";
import { buildTasksQueryParams, buildProjectsQueryParams } from "../notionQueryBuilder.js";
import {
  getTitleProperty,
  getStatusProperty,
  getPeopleProperty,
  getDateProperty,
  getNumberProperty,
  getProjectNameProperty,
  getOwnerNameProperty,
  isCompletedStatus,
  isBlockedStatus,
} from "../notionNormalizer.js";
import { isTaskOverdue } from "../analysis/detectOverdue.js";

/**
 * Notion "Progress" properties (number or formula) commonly use the "Percent"
 * display format, where the underlying value is a 0-1 fraction (e.g. 0.45 = "45%").
 * Values already greater than 1 are assumed to be a plain 0-100 percentage.
 */
function normalizeProgressValue(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.round(value >= 0 && value <= 1 ? value * 100 : value);
}

/**
 * Real Notion adapter (read-only). Fetches up to 100 pages per configured
 * database and normalizes them. Property names are configurable via
 * NOTION_TASK_*_PROPERTY / NOTION_PROJECT_*_PROPERTY env vars.
 */
class NotionRealAdapter implements NotionProjectAdapter {
  isAvailable(): boolean {
    const config = getNotionConfig();
    return config.enabled && Boolean(config.apiKey);
  }

  async queryTasks(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionTask[]> {
    const config = getNotionConfig();
    if (!isNotionTasksAvailable(config)) {
      throw new NotionQueryError("NOTION_TASKS_DATABASE_ID no está configurado.");
    }

    const pages = await queryDatabasePages(config.apiKey!, config.tasksDatabaseId!, buildTasksQueryParams());
    const props = config.taskProperties;

    return pages.map((page) => {
      const status = getStatusProperty(page.properties, props.status);
      const isCompleted = isCompletedStatus(status);
      const dueDate = getDateProperty(page.properties, props.dueDate);

      return {
        id: page.id,
        title: getTitleProperty(page.properties, props.title) ?? "(Sin título)",
        status,
        assignees: getPeopleProperty(page.properties, props.assignee),
        dueDate,
        projectName: getProjectNameProperty(page.properties, props.project),
        priority: getStatusProperty(page.properties, props.priority) ?? getNumberProperty(page.properties, props.priority)?.toString(),
        url: page.url ?? undefined,
        isCompleted,
        isBlocked: isBlockedStatus(status),
        isOverdue: isTaskOverdue(dueDate, isCompleted),
        lastEditedTime: page.lastEditedTime,
        dataSource: "notion_api",
      };
    });
  }

  async queryProjects(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionProject[]> {
    const config = getNotionConfig();
    if (!isNotionProjectsAvailable(config)) {
      throw new NotionQueryError("NOTION_PROJECTS_DATABASE_ID no está configurado.");
    }

    const pages = await queryDatabasePages(config.apiKey!, config.projectsDatabaseId!, buildProjectsQueryParams());
    const props = config.projectProperties;

    return pages.map((page) => ({
      id: page.id,
      title: getTitleProperty(page.properties, props.title) ?? "(Sin título)",
      status: getStatusProperty(page.properties, props.status),
      owner: getOwnerNameProperty(page.properties, props.owner),
      progress: normalizeProgressValue(getNumberProperty(page.properties, props.progress)),
      dueDate: getDateProperty(page.properties, props.dueDate),
      url: page.url ?? undefined,
      lastEditedTime: page.lastEditedTime,
      dataSource: "notion_api",
    }));
  }
}

export const notionRealAdapter = new NotionRealAdapter();
