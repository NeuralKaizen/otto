export interface NotionDatabaseQueryParams {
  sorts?: { timestamp: "created_time" | "last_edited_time"; direction: "ascending" | "descending" }[];
}

/**
 * v1 query strategy: fetch up to 100 pages per database (most recently edited
 * first) and filter locally by person/project/status/due date. This avoids
 * brittle Notion API filters that depend on per-workspace property types
 * (e.g. "Status" as `status` vs `select`, "Assignee" as `people` vs `rich_text`).
 */
export function buildTasksQueryParams(): NotionDatabaseQueryParams {
  return { sorts: [{ timestamp: "last_edited_time", direction: "descending" }] };
}

export function buildProjectsQueryParams(): NotionDatabaseQueryParams {
  return { sorts: [{ timestamp: "last_edited_time", direction: "descending" }] };
}
