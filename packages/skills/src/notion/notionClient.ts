import { Client, isFullPage, isNotionClientError, APIErrorCode } from "@notionhq/client";
import type { NotionProperties } from "./notionNormalizer.js";
import type { NotionDatabaseQueryParams } from "./notionQueryBuilder.js";

const MAX_RESULTS = 100;
const PAGE_SIZE = 100;

export class NotionQueryError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "NotionQueryError";
    this.status = status;
  }
}

export interface NotionPage {
  id: string;
  url: string | null;
  lastEditedTime: string;
  properties: NotionProperties;
}

let cachedClient: { apiKey: string; client: Client } | undefined;

function getClient(apiKey: string): Client {
  if (cachedClient?.apiKey === apiKey) return cachedClient.client;
  const client = new Client({ auth: apiKey });
  cachedClient = { apiKey, client };
  return client;
}

/** Maps Notion API errors to safe, user-facing messages. Never includes the API key. */
function toFriendlyError(err: unknown, databaseId: string): NotionQueryError {
  if (isNotionClientError(err)) {
    switch (err.code) {
      case APIErrorCode.Unauthorized:
        return new NotionQueryError(
          "Notion respondió 401 (no autorizado). Verifica que NOTION_API_KEY sea correcta y siga activa.",
          401
        );
      case APIErrorCode.RestrictedResource:
        return new NotionQueryError(
          `Notion respondió 403 (sin acceso) para la database ${databaseId}. Comparte esa database con tu integración desde "Add connections" en Notion.`,
          403
        );
      case APIErrorCode.ObjectNotFound:
        return new NotionQueryError(
          `Notion respondió 404 para la database ${databaseId}. Verifica el ID y que la integración tenga acceso ("Add connections").`,
          404
        );
      case APIErrorCode.RateLimited:
        return new NotionQueryError(
          "Notion respondió 429 (rate limit). Intenta de nuevo en unos segundos.",
          429
        );
      default:
        return new NotionQueryError(`Notion respondió un error (${err.code}).`);
    }
  }
  return new NotionQueryError(
    `Error inesperado consultando Notion: ${err instanceof Error ? err.message : String(err)}`
  );
}

/**
 * Fetches up to MAX_RESULTS pages from a database, following `has_more`/`next_cursor`.
 * Filtering is done locally by callers (see notionQueryBuilder.ts).
 */
export async function queryDatabasePages(
  apiKey: string,
  databaseId: string,
  params: NotionDatabaseQueryParams = {}
): Promise<NotionPage[]> {
  const client = getClient(apiKey);
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await client.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: Math.min(PAGE_SIZE, MAX_RESULTS - pages.length),
        sorts: params.sorts,
      });

      for (const result of response.results) {
        if (isFullPage(result)) {
          pages.push({
            id: result.id,
            url: result.url,
            lastEditedTime: result.last_edited_time,
            properties: result.properties as unknown as NotionProperties,
          });
        }
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor && pages.length < MAX_RESULTS);
  } catch (err) {
    throw toFriendlyError(err, databaseId);
  }

  return pages;
}
