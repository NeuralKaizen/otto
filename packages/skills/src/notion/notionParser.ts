import type { NotionProjectIntelligenceRequest, NotionQueryIntent } from "./types.js";

interface KnownEntity {
  pattern: RegExp;
  canonical: string;
}

// Mock dataset people — recognized regardless of accents/case so "jose"/"José" both resolve.
const KNOWN_PEOPLE: KnownEntity[] = [
  { pattern: /\bdaniel\b/i, canonical: "Daniel" },
  { pattern: /\bpablo\b/i, canonical: "Pablo" },
  { pattern: /\bjos[eé]\b/i, canonical: "Jose" },
  { pattern: /\bmar[ií]a\b/i, canonical: "María" },
  { pattern: /\bcamilo\b/i, canonical: "Camilo" },
];

// Mock dataset projects — checked first so multi-word names ("CRM Notion") resolve correctly.
const KNOWN_PROJECTS: KnownEntity[] = [
  { pattern: /\bcrm notion\b/i, canonical: "CRM Notion" },
  { pattern: /\bsocial metrics\b/i, canonical: "Social Metrics" },
  { pattern: /\bjarvis\b/i, canonical: "Jarvis" },
  { pattern: /\bacelera\b/i, canonical: "Acelera" },
  { pattern: /\bhouston\b/i, canonical: "Houston" },
];

const PERSON_PATTERNS = [
  /(?:asignadas? a|asignado a|asignada a|responsable(?: de| es)?)\s+([A-ZÀ-Þ][\wÀ-ÿ'-]*)/i,
  /\btiene\s+(?:pendientes?|bloquead[oa]s?|asignad[oa]s?)?\s*([A-ZÀ-Þ][\wÀ-ÿ'-]*)/i,
  /\bde\s+([A-ZÀ-Þ][\wÀ-ÿ'-]*)\s*(?:pendientes?|$)/i,
  /\bpara\s+([A-ZÀ-Þ][\wÀ-ÿ'-]*)/i,
];

const PERSON_STOPWORDS = new Set(["notion", "jarvis", "acelera", "houston"]);

const PROJECT_PATTERN = /(?:del proyecto|proyecto)\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ0-9-]*)/i;

function extractPersonName(message: string): string | undefined {
  for (const { pattern, canonical } of KNOWN_PEOPLE) {
    if (pattern.test(message)) return canonical;
  }

  for (const pattern of PERSON_PATTERNS) {
    const match = message.match(pattern);
    const candidate = match?.[1];
    if (candidate && !PERSON_STOPWORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return undefined;
}

function extractProjectName(message: string): string | undefined {
  for (const { pattern, canonical } of KNOWN_PROJECTS) {
    if (pattern.test(message)) return canonical;
  }

  const match = message.match(PROJECT_PATTERN);
  return match?.[1];
}

function extractDueRange(m: string): NotionProjectIntelligenceRequest["dueRange"] {
  if (/vencid|atrasad/.test(m)) return "overdue";
  if (/\bhoy\b/.test(m)) return "today";
  if (/esta semana/.test(m)) return "this_week";
  if (/próxim|proxim/.test(m)) return "upcoming";
  return "all";
}

function extractIncludeCompleted(m: string): boolean {
  return /\bincluye(?:ndo)?\s+completadas\b|\bincluir\s+completadas\b|\btodas\b/.test(m);
}

/**
 * Determines the Notion query intent and extracts person/project/date filters
 * from a free-text message. Regex/keyword based — no LLM call.
 */
export function parseNotionQuery(message: string): NotionProjectIntelligenceRequest {
  const m = message.toLowerCase();

  const dueRange = extractDueRange(m);
  const includeCompleted = extractIncludeCompleted(m);
  const personName = extractPersonName(message);
  const projectName = extractProjectName(message);

  let intent: NotionQueryIntent;

  if (/daily briefing|briefing diario|resumen diario/.test(m)) {
    intent = "daily_task_briefing";
  } else if (/bloque/.test(m)) {
    intent = "blocked_tasks";
  } else if (/vencid|atrasad/.test(m)) {
    intent = "overdue_tasks";
  } else if (projectName && /(en qué va|en que va|avance|estado del proyecto|cómo va|como va|resume el estado|resumen del proyecto)/.test(m)) {
    intent = "project_status";
  } else if (projectName && /(pendiente|tarea|task|falta)/.test(m)) {
    intent = "tasks_by_project";
  } else if (personName || /(tiene|asignad|responsable|qué tiene|que tiene|quién tiene|quien tiene)/.test(m)) {
    intent = "tasks_by_person";
  } else if (projectName) {
    intent = "project_status";
  } else {
    // Broad/ambiguous queries ("resumen general", "cómo van las tareas del
    // equipo", "todos los proyectos", just "Notion", etc.) default to a
    // workspace-wide overview instead of asking the user to clarify.
    intent = "workspace_overview";
  }

  return {
    rawQuery: message,
    intent,
    personName,
    projectName,
    dueRange,
    includeCompleted,
  };
}
