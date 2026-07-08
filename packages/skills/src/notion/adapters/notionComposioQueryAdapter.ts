import type {
  NormalizedNotionProject,
  NormalizedNotionTask,
  NotionProjectAdapter,
  NotionProjectIntelligenceRequest,
} from "../types.js";
import { getNotionConfig, isNotionComposioQueryAvailable } from "../notionConfig.js";
import { executeNotionComposioAction } from "../notionComposioClient.js";
import { NotionQueryError } from "../notionClient.js";
import type { NotionProperties } from "../notionNormalizer.js";
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

const QUERY_DATABASE_ACTION = "NOTION_QUERY_DATABASE";

/**
 * Raw row shape assumed for the Composio `NOTION_QUERY_DATABASE` action response.
 * Composio's Notion toolkit passes through Notion's own `databases.query` API
 * response, so each row is a full Notion page object: `{ id, properties, url,
 * last_edited_time }` with `properties` using Notion's native type-tagged
 * property values (`{ type: "title", title: [...] }`, etc.) — the same shape
 * `notionRealAdapter.ts` reads via `notionClient.ts`'s `queryDatabasePages`.
 * This assumption is corroborated by `composio/normalizers/notionNormalizer.ts`
 * (`normalizeNotionResult`), which already reads `data.results[].id/.properties/.url`
 * for the same action family. `last_edited_time` itself isn't read by that
 * normalizer, so its presence/naming (snake_case, as in Notion's raw API) is
 * this adapter's own assumption — verified end-to-end in Task 7.
 */
interface RawNotionComposioRow {
  id?: string;
  url?: string | null;
  last_edited_time?: string;
  properties?: NotionProperties;
}

interface RawNotionComposioQueryResponse {
  results?: RawNotionComposioRow[];
}

/**
 * Notion "Progress" properties (number or formula) commonly use the "Percent"
 * display format, where the underlying value is a 0-1 fraction (e.g. 0.45 = "45%").
 * Values already greater than 1 are assumed to be a plain 0-100 percentage.
 * (Kept identical to notionRealAdapter.ts's normalizeProgressValue for parity.)
 */
function normalizeProgressValue(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.round(value >= 0 && value <= 1 ? value * 100 : value);
}

async function queryDatabaseRows(databaseId: string): Promise<RawNotionComposioRow[]> {
  const result = await executeNotionComposioAction(QUERY_DATABASE_ACTION, { database_id: databaseId });

  if (!result.successful) {
    throw new NotionQueryError(
      result.error ?? `La acción ${QUERY_DATABASE_ACTION} no se pudo ejecutar vía Composio.`
    );
  }

  const data = result.data as RawNotionComposioQueryResponse | undefined;
  return Array.isArray(data?.results) ? data!.results : [];
}

/**
 * Notion "project intelligence" adapter that queries Notion exclusively via
 * Composio (OAuth-connected account), never via a raw NOTION_API_KEY. Produces
 * the same normalized shapes as `notionRealAdapter.ts`, reusing its property
 * normalizers so the two adapters never diverge in how they map Notion
 * properties.
 */
class NotionComposioQueryAdapter implements NotionProjectAdapter {
  isAvailable(): boolean {
    return isNotionComposioQueryAvailable();
  }

  async queryTasks(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionTask[]> {
    const config = getNotionConfig();
    if (!config.tasksDatabaseId) {
      throw new NotionQueryError("NOTION_TASKS_DATABASE_ID no está configurado.");
    }

    const rows = await queryDatabaseRows(config.tasksDatabaseId);
    const props = config.taskProperties;

    return rows.map((row) => {
      const properties = row.properties ?? {};
      const status = getStatusProperty(properties, props.status);
      const isCompleted = isCompletedStatus(status);
      const dueDate = getDateProperty(properties, props.dueDate);

      return {
        id: row.id ?? "",
        title: getTitleProperty(properties, props.title) ?? "(Sin título)",
        status,
        assignees: getPeopleProperty(properties, props.assignee),
        dueDate,
        projectName: getProjectNameProperty(properties, props.project),
        priority:
          getStatusProperty(properties, props.priority) ??
          getNumberProperty(properties, props.priority)?.toString(),
        url: row.url ?? undefined,
        isCompleted,
        isBlocked: isBlockedStatus(status),
        isOverdue: isTaskOverdue(dueDate, isCompleted),
        lastEditedTime: row.last_edited_time,
        dataSource: "notion_api",
      };
    });
  }

  async queryProjects(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionProject[]> {
    const config = getNotionConfig();
    if (!config.projectsDatabaseId) {
      throw new NotionQueryError("NOTION_PROJECTS_DATABASE_ID no está configurado.");
    }

    const rows = await queryDatabaseRows(config.projectsDatabaseId);
    const props = config.projectProperties;

    return rows.map((row) => {
      const properties = row.properties ?? {};
      return {
        id: row.id ?? "",
        title: getTitleProperty(properties, props.title) ?? "(Sin título)",
        status: getStatusProperty(properties, props.status),
        owner: getOwnerNameProperty(properties, props.owner),
        progress: normalizeProgressValue(getNumberProperty(properties, props.progress)),
        dueDate: getDateProperty(properties, props.dueDate),
        url: row.url ?? undefined,
        lastEditedTime: row.last_edited_time,
        dataSource: "notion_api",
      };
    });
  }
}

export const notionComposioQueryAdapter = new NotionComposioQueryAdapter();
