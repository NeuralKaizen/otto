export interface NormalizedComposioNotionItem {
  id: string;
  title: string;
  status?: string;
  assignee?: string;
  dueDate?: string;
  project?: string;
  url?: string;
  object?: string;
}

export interface NormalizedComposioNotionResult {
  items: NormalizedComposioNotionItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extracts a plain-text title from a Notion page/database object's `properties` or top-level `title` rich text array. */
function extractTitle(result: Record<string, unknown>): string {
  const titleArray = (richTextFromProperties(result) ?? result.title) as unknown;
  if (!Array.isArray(titleArray)) return "(sin título)";

  const text = titleArray
    .map((part) => (isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : ""))
    .join("")
    .trim();

  return text.length > 0 ? text : "(sin título)";
}

function richTextFromProperties(result: Record<string, unknown>): unknown[] | undefined {
  const properties = result.properties;
  if (!isRecord(properties)) return undefined;

  for (const value of Object.values(properties)) {
    if (isRecord(value) && value.type === "title" && Array.isArray(value.title)) {
      return value.title;
    }
  }
  return undefined;
}

function plainTextFromRichText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .map((part) => (isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : ""))
    .join("")
    .trim();
  return text.length > 0 ? text : undefined;
}

/** Finds the first property matching `type`, preferring properties named in `preferredNames` (case-sensitive, workspace-specific). */
function findPropertyByType(properties: Record<string, unknown>, type: string, preferredNames: string[]): Record<string, unknown> | undefined {
  for (const name of preferredNames) {
    const prop = properties[name];
    if (isRecord(prop) && prop.type === type) return prop;
  }
  for (const value of Object.values(properties)) {
    if (isRecord(value) && value.type === type) return value;
  }
  return undefined;
}

/** Reads a "Status"-typed or "Status"/"Estado"-named "select" property. */
function extractStatus(properties: Record<string, unknown>): string | undefined {
  const statusProp = findPropertyByType(properties, "status", ["Status", "Estado"]);
  if (isRecord(statusProp?.status) && typeof statusProp.status.name === "string") return statusProp.status.name;

  const selectProp = findPropertyByType(properties, "select", ["Status", "Estado"]);
  if (isRecord(selectProp?.select) && typeof selectProp.select.name === "string") return selectProp.select.name;

  return undefined;
}

/** Reads a "people"-typed property (assignee/owner), joining multiple names with ", ". */
function extractAssignee(properties: Record<string, unknown>): string | undefined {
  const peopleProp = findPropertyByType(properties, "people", ["Assignee", "Resposable", "Responsable", "Owner"]);
  if (!Array.isArray(peopleProp?.people)) return undefined;

  const names = peopleProp.people
    .filter(isRecord)
    .map((p) => (typeof p.name === "string" ? p.name : undefined))
    .filter((n): n is string => Boolean(n));

  return names.length > 0 ? names.join(", ") : undefined;
}

/** Reads a "date"-typed property's start date. */
function extractDueDate(properties: Record<string, unknown>): string | undefined {
  const dateProp = findPropertyByType(properties, "date", ["Due", "Due date", "Fecha límite", "Próxima Entrega"]);
  if (isRecord(dateProp?.date) && typeof dateProp.date.start === "string") return dateProp.date.start;
  return undefined;
}

/**
 * Best-effort project name. Notion's raw `relation` properties only carry
 * related-page IDs (no titles) unless the integration expands them via a
 * `rollup` with a title formula — handle that case, and otherwise omit the
 * field rather than show an opaque ID.
 */
function extractProject(properties: Record<string, unknown>): string | undefined {
  const rollupProp = findPropertyByType(properties, "rollup", ["Project", "Proyectos", "Proyecto"]);
  const rollupArray = isRecord(rollupProp?.rollup) ? rollupProp.rollup.array : undefined;
  if (Array.isArray(rollupArray)) {
    const titles = rollupArray
      .filter(isRecord)
      .map((entry) => plainTextFromRichText(entry.title))
      .filter((t): t is string => Boolean(t));
    if (titles.length > 0) return titles.join(", ");
  }
  return undefined;
}

/** Normalizes the response from NOTION_SEARCH_NOTION_PAGE / NOTION_QUERY_DATABASE into a simple item list. */
export function normalizeNotionResult(data: unknown): NormalizedComposioNotionResult {
  if (!isRecord(data)) return { items: [] };

  const results = Array.isArray(data.results) ? data.results : [];

  const items: NormalizedComposioNotionItem[] = results.filter(isRecord).map((result) => {
    const properties = isRecord(result.properties) ? result.properties : {};
    return {
      id: typeof result.id === "string" ? result.id : "",
      title: extractTitle(result),
      status: extractStatus(properties),
      assignee: extractAssignee(properties),
      dueDate: extractDueDate(properties),
      project: extractProject(properties),
      url: typeof result.url === "string" ? result.url : undefined,
      object: typeof result.object === "string" ? result.object : undefined,
    };
  });

  return { items };
}
