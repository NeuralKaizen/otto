// Minimal shapes for the Notion property value types we read.
// Kept local (instead of importing the full @notionhq/client response types)
// so normalization stays simple and resilient to unexpected shapes.

interface NotionRichTextItem {
  plain_text?: string;
}

interface NotionTitleProperty {
  type: "title";
  title?: NotionRichTextItem[];
}

interface NotionRichTextProperty {
  type: "rich_text";
  rich_text?: NotionRichTextItem[];
}

interface NotionStatusProperty {
  type: "status";
  status?: { name?: string } | null;
}

interface NotionSelectProperty {
  type: "select";
  select?: { name?: string } | null;
}

interface NotionMultiSelectProperty {
  type: "multi_select";
  multi_select?: { name?: string }[];
}

interface NotionPeopleProperty {
  type: "people";
  people?: { name?: string; id?: string }[];
}

interface NotionDateProperty {
  type: "date";
  date?: { start?: string; end?: string | null } | null;
}

interface NotionNumberProperty {
  type: "number";
  number?: number | null;
}

interface NotionFormulaProperty {
  type: "formula";
  formula?: { type?: string; number?: number | null } | null;
}

interface NotionRelationProperty {
  type: "relation";
  relation?: { id?: string }[];
}

interface NotionCheckboxProperty {
  type: "checkbox";
  checkbox?: boolean;
}

export type NotionPropertyValue =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionStatusProperty
  | NotionSelectProperty
  | NotionMultiSelectProperty
  | NotionPeopleProperty
  | NotionDateProperty
  | NotionNumberProperty
  | NotionFormulaProperty
  | NotionRelationProperty
  | NotionCheckboxProperty
  | { type: string; [key: string]: unknown };

export type NotionProperties = Record<string, NotionPropertyValue | undefined>;

function getProperty(properties: NotionProperties, name: string): NotionPropertyValue | undefined {
  return properties[name];
}

export function getTitleProperty(properties: NotionProperties, name: string): string | undefined {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "title") return undefined;
  const text = (prop as NotionTitleProperty).title?.map((t) => t.plain_text ?? "").join("") ?? "";
  return text.length > 0 ? text : undefined;
}

export function getRichTextProperty(properties: NotionProperties, name: string): string | undefined {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "rich_text") return undefined;
  const text = (prop as NotionRichTextProperty).rich_text?.map((t) => t.plain_text ?? "").join("") ?? "";
  return text.length > 0 ? text : undefined;
}

/** Reads a "Status" property. Supports both Notion's native `status` type and a plain `select`. */
export function getStatusProperty(properties: NotionProperties, name: string): string | undefined {
  const prop = getProperty(properties, name);
  if (!prop) return undefined;
  if (prop.type === "status") return (prop as NotionStatusProperty).status?.name ?? undefined;
  if (prop.type === "select") return (prop as NotionSelectProperty).select?.name ?? undefined;
  return undefined;
}

export function getSelectProperty(properties: NotionProperties, name: string): string | undefined {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "select") return undefined;
  return (prop as NotionSelectProperty).select?.name ?? undefined;
}

export function getMultiSelectProperty(properties: NotionProperties, name: string): string[] {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "multi_select") return [];
  return ((prop as NotionMultiSelectProperty).multi_select ?? [])
    .map((o) => o.name)
    .filter((n): n is string => Boolean(n));
}

/** Reads a "people" property as display names. Falls back to user IDs if a name isn't present. */
export function getPeopleProperty(properties: NotionProperties, name: string): string[] {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "people") return [];
  return ((prop as NotionPeopleProperty).people ?? [])
    .map((p) => p.name ?? p.id)
    .filter((n): n is string => Boolean(n));
}

/** Returns the start date (YYYY-MM-DD or ISO datetime) of a date property, if set. */
export function getDateProperty(properties: NotionProperties, name: string): string | undefined {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "date") return undefined;
  return (prop as NotionDateProperty).date?.start ?? undefined;
}

/** Reads a "number" property. Also supports `formula` properties whose result is numeric (e.g. a "Progress" formula). */
export function getNumberProperty(properties: NotionProperties, name: string): number | undefined {
  const prop = getProperty(properties, name);
  if (!prop) return undefined;

  if (prop.type === "number") {
    const value = (prop as NotionNumberProperty).number;
    return value === null || value === undefined ? undefined : value;
  }

  if (prop.type === "formula") {
    const formula = (prop as NotionFormulaProperty).formula;
    if (formula?.type === "number" && typeof formula.number === "number") {
      return formula.number;
    }
    return undefined;
  }

  return undefined;
}

/** Returns related page IDs for a relation property. */
export function getRelationProperty(properties: NotionProperties, name: string): string[] {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "relation") return [];
  return ((prop as NotionRelationProperty).relation ?? [])
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));
}

export function getCheckboxProperty(properties: NotionProperties, name: string): boolean {
  const prop = getProperty(properties, name);
  if (!prop || prop.type !== "checkbox") return false;
  return Boolean((prop as NotionCheckboxProperty).checkbox);
}

/**
 * Reads a task's "Project" property regardless of its underlying type.
 * - rich_text / select → returns the name directly.
 * - relation → returns the related page's ID (a UUID), which callers can
 *   resolve to a project title using a projects ID→title map.
 */
export function getProjectNameProperty(properties: NotionProperties, name: string): string | undefined {
  return (
    getRichTextProperty(properties, name) ??
    getSelectProperty(properties, name) ??
    getRelationProperty(properties, name)[0]
  );
}

/** Reads a project's "Owner" property as a single name, supporting people/select/rich_text. */
export function getOwnerNameProperty(properties: NotionProperties, name: string): string | undefined {
  const people = getPeopleProperty(properties, name);
  if (people.length > 0) return people[0];
  return getSelectProperty(properties, name) ?? getRichTextProperty(properties, name);
}

/** Lowercases, trims, and strips accents — used to compare names/statuses loosely. */
const DIACRITICS_PATTERN = /[̀-ͯ]/g;

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .trim()
    .toLowerCase();
}

const COMPLETED_STATUSES = ["done", "completed", "complete", "finalizado", "completado", "hecho", "cerrado"];
const BLOCKED_STATUSES = ["blocked", "bloqueado", "stuck", "waiting", "en espera"];

export function isCompletedStatus(status?: string): boolean {
  if (!status) return false;
  return COMPLETED_STATUSES.includes(normalizeName(status));
}

export function isBlockedStatus(status?: string): boolean {
  if (!status) return false;
  return BLOCKED_STATUSES.includes(normalizeName(status));
}
