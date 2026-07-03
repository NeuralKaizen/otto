import type { ComposioActionRisk, ComposioToolkit, ComposioToolRequest, ParsedComposioQuery } from "./types.js";
import { defaultReadAction, nonReadActions } from "./composioToolRegistry.js";

// --- Toolkit detection -----------------------------------------------------

interface ToolkitPattern {
  toolkit: ComposioToolkit;
  /** App name itself — an unambiguous signal, wins immediately. */
  strong: RegExp;
  /** Toolkit-specific domain vocabulary that implies this toolkit when no app name is present. */
  weak: RegExp;
  /** Vocabulary shared across many apps (e.g. "tareas", "proyectos") — only used as a last resort, after `weak` patterns from every toolkit are checked. */
  generic?: RegExp;
}

const TOOLKIT_PATTERNS: ToolkitPattern[] = [
  {
    toolkit: "notion",
    strong: /\bnotion\b/i,
    weak: /\b(p[aá]ginas?|database|bases? de datos)\b/i,
    // "tareas"/"proyectos" alone are too generic to outrank Gmail/Calendar/GitHub's more specific weak vocabulary.
    generic: /\b(tareas?|tasks?|proyectos?)\b/i,
  },
  {
    toolkit: "gmail",
    strong: /\bgmail\b/i,
    weak: /\b(correos?|emails?|mails?|inbox|bandeja|borradores?|borrador)\b/i,
  },
  {
    toolkit: "googlecalendar",
    strong: /\b(google calendar|calendario|calendar)\b/i,
    weak: /\b(agenda|reuni[oó]n(?:es)?|eventos?|citas?)\b/i,
  },
  {
    toolkit: "slack",
    strong: /\bslack\b/i,
    weak: /\b(canales?|mensaje en slack)\b/i,
  },
  {
    toolkit: "github",
    strong: /\bgithub\b/i,
    weak: /\b(issues?|pull requests?|repos?|repositorios?|branch(?:es)?)\b/i,
  },
];

interface ToolkitDetection {
  toolkit: ComposioToolkit;
  confidence: number;
  warning?: string;
}

function detectToolkit(message: string): ToolkitDetection | null {
  for (const p of TOOLKIT_PATTERNS) {
    if (p.strong.test(message)) return { toolkit: p.toolkit, confidence: 0.9 };
  }

  const weakMatches = TOOLKIT_PATTERNS.filter((p) => p.weak.test(message));
  if (weakMatches.length === 1) return { toolkit: weakMatches[0].toolkit, confidence: 0.6 };
  if (weakMatches.length > 1) {
    return {
      toolkit: weakMatches[0].toolkit,
      confidence: 0.4,
      warning: `Mensaje ambiguo entre varias apps (${weakMatches.map((w) => w.toolkit).join(", ")}); se asumió "${weakMatches[0].toolkit}".`,
    };
  }

  const genericMatch = TOOLKIT_PATTERNS.find((p) => p.generic?.test(message));
  if (genericMatch) return { toolkit: genericMatch.toolkit, confidence: 0.5 };

  return null;
}

// --- Action-risk (read/write/send/delete) detection ------------------------

const DELETE_PATTERN = /\b(elimina|eliminar|borra|borrar|archiva|archivar)\b/i;
const SEND_PATTERN = /\b(env[ií]a|enviar|manda|mandar|comparte|compartir|invita|invitar|publica|publicar)\b/i;
const WRITE_PATTERN = /\b(crea|crear|a[ñn]ade|a[ñn]adir|agrega|agregar|actualiza|actualizar|cambia|cambiar|mueve|mover|asigna|asignar|comenta|comentar)\b/i;
const READ_PATTERN = /\b(busca|buscar|lista|listar|consulta|consultar|revisa|revisar|muestra|mostrar|qu[eé] tengo|cu[aá]les son|en qu[eé] va)\b/i;

interface ActionRiskDetection {
  risk: ComposioActionRisk;
  matched: boolean;
}

function detectActionRisk(message: string): ActionRiskDetection {
  if (DELETE_PATTERN.test(message)) return { risk: "delete", matched: true };
  if (SEND_PATTERN.test(message)) return { risk: "send", matched: true };
  if (WRITE_PATTERN.test(message)) return { risk: "write", matched: true };
  if (READ_PATTERN.test(message)) return { risk: "read", matched: true };
  return { risk: "read", matched: false };
}

// --- Action selection from the registry -------------------------------------

interface ActionSelection {
  action: string;
  warnings: string[];
}

/**
 * Picks a concrete Composio action slug for (toolkit, risk) from the curated
 * registry. Never invents an action: if the requested risk has no registered
 * action, falls back to the toolkit's default read action (always present)
 * and records why.
 */
function selectAction(toolkit: ComposioToolkit, risk: ComposioActionRisk): ActionSelection {
  const warnings: string[] = [];
  const readAction = defaultReadAction(toolkit);

  if (risk === "read") {
    if (readAction) return { action: readAction.action, warnings };
    warnings.push(`No hay una acción de lectura registrada para "${toolkit}".`);
    return { action: "", warnings };
  }

  const candidates = nonReadActions(toolkit);
  const exact = candidates.find((c) => c.risk === risk);
  if (exact) return { action: exact.action, warnings };

  if (candidates.length > 0) {
    const fallback = candidates[0];
    warnings.push(
      `No hay una acción "${risk}" registrada para "${toolkit}"; usando "${fallback.action}" (${fallback.risk}) en su lugar.`
    );
    return { action: fallback.action, warnings };
  }

  if (readAction) {
    warnings.push(
      `No hay una acción "${risk}" registrada para "${toolkit}"; usando una acción de lectura segura (${readAction.action}).`
    );
    return { action: readAction.action, warnings };
  }

  warnings.push(`No hay ninguna acción registrada para "${toolkit}".`);
  return { action: "", warnings };
}

// --- Shared parameter extraction (dates, statuses) --------------------------

const DATE_RANGE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bpr[oó]xima semana\b/i, value: "next_week" },
  { pattern: /\besta semana\b/i, value: "this_week" },
  { pattern: /\bma[ñn]ana\b/i, value: "tomorrow" },
  { pattern: /\bhoy\b/i, value: "today" },
];

const STATUS_FILTER_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(vencidas?|atrasadas?)\b/i, value: "overdue" },
  { pattern: /\bpendientes?\b/i, value: "pending" },
  { pattern: /\bbloqueadas?\b/i, value: "blocked" },
  { pattern: /\bcompletadas?\b/i, value: "completed" },
];

function extractDateRange(message: string): string | undefined {
  for (const { pattern, value } of DATE_RANGE_PATTERNS) {
    if (pattern.test(message)) return value;
  }
  return undefined;
}

function extractStatusFilter(message: string): string | undefined {
  for (const { pattern, value } of STATUS_FILTER_PATTERNS) {
    if (pattern.test(message)) return value;
  }
  return undefined;
}

// --- Proper-noun extraction (person/project/sender/recipient/repo names) ----
// These run against the ORIGINAL (non-lowercased) message, since they rely on
// capitalization to find proper nouns. Matches a single capitalized word or
// two consecutive capitalized words (e.g. "Daniel", "Jose Fonseca").
const NAME = "[A-ZÁÉÍÓÚÑ][\\wáéíóúñ]*(?:\\s+[A-ZÁÉÍÓÚÑ][\\wáéíóúñ]*)?";

function firstMatch(message: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

const PERSON_PATTERNS = [
  new RegExp(`\\basignadas?\\s+a\\s+(${NAME})`),
  new RegExp(`\\bresponsable\\s+(?:de\\s+)?(${NAME})`),
  new RegExp(`\\bque tiene\\s+(${NAME})`),
  new RegExp(`\\b(${NAME})\\s+tiene\\b`),
  new RegExp(`\\b(?:de|para|a|con)\\s+(${NAME})\\b`),
];

const PROJECT_PATTERNS = [
  new RegExp(`\\bproyectos?\\s+(${NAME})`),
  new RegExp(`\\ben qu[ée] va(?: el proyecto)?\\s+(${NAME})`, "i"),
  new RegExp(`\\bavance de\\s+(${NAME})`),
];

const SENDER_PATTERNS = [new RegExp(`\\bde\\s+(${NAME})\\b`)];
const RECIPIENT_PATTERNS = [
  new RegExp(`\\bpara\\s+(${NAME})\\b`),
  // "Envía/manda un correo A María" — only after a send verb, so plain "a" elsewhere isn't misread as a recipient.
  // No "i" flag: NAME relies on case to spot proper nouns, so the verb alternatives spell out both cases instead.
  new RegExp(`\\b(?:[Ee]nv[ií]a|[Mm]anda|[Ee]scribe|[Rr]eenv[ií]a)\\b.*?\\ba\\s+(${NAME})\\b`),
];
const REPO_PATTERNS = [new RegExp(`\\brepos?(?:itorios?)?\\s+(${NAME})`)];

function extractPersonName(message: string, exclude?: string): string | undefined {
  for (const pattern of PERSON_PATTERNS) {
    const match = message.match(pattern);
    const value = match?.[1]?.trim();
    if (value && value !== exclude) return value;
  }
  return undefined;
}

// --- Gmail-specific parameter extraction ------------------------------------

const SUBJECT_PATTERN = /\bcon asunto[:]?\s*"?([^".,;\n]+)"?/i;
const GMAIL_LIMIT_PATTERN = /\b[uú]ltimos?\s+(\d+)\s+correos?\b/i;
const DRAFT_PATTERN = /\bborradores?\b/i;

// --- Calendar-specific parameter extraction ----------------------------------

const MEETING_PATTERN = /\breuni[oó]n(?:es)?\b/i;

// --- GitHub-specific parameter extraction -------------------------------------

const GITHUB_OPEN_PATTERN = /\babiertos?\b/i;
const GITHUB_CLOSED_PATTERN = /\bcerrados?\b/i;
const PULL_REQUEST_PATTERN = /\bpull requests?\b/i;

// --- Generic fallback "query" extraction (legacy behavior, used by mock) ----

const QUERY_PATTERN = /(?:de|sobre|para|about)\s+(.+)$/i;

function extractGenericQuery(message: string): string | undefined {
  const match = message.match(QUERY_PATTERN);
  if (!match) return undefined;
  const value = match[1].trim().replace(/[?.!]+$/, "");
  return value.length > 0 ? value : undefined;
}

// --- Toolkit-specific param extraction ---------------------------------------

function extractToolkitParams(message: string, toolkit: ComposioToolkit): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  switch (toolkit) {
    case "gmail": {
      const sender = firstMatch(message, SENDER_PATTERNS);
      if (sender) params.senderName = sender;
      const recipient = firstMatch(message, RECIPIENT_PATTERNS);
      if (recipient) params.recipientName = recipient;
      const subjectMatch = message.match(SUBJECT_PATTERN);
      if (subjectMatch?.[1]) params.subject = subjectMatch[1].trim();
      const limitMatch = message.match(GMAIL_LIMIT_PATTERN);
      if (limitMatch?.[1]) params.limit = parseInt(limitMatch[1], 10);
      if (DRAFT_PATTERN.test(message)) params.draft = true;
      break;
    }
    case "googlecalendar": {
      const person = extractPersonName(message);
      if (person) params.personName = person;
      if (MEETING_PATTERN.test(message)) params.eventType = "meeting";
      break;
    }
    case "github": {
      if (GITHUB_OPEN_PATTERN.test(message)) params.status = "open";
      else if (GITHUB_CLOSED_PATTERN.test(message)) params.status = "closed";
      const repo = firstMatch(message, REPO_PATTERNS);
      if (repo) params.repoName = repo;
      if (PULL_REQUEST_PATTERN.test(message)) params.type = "pull_request";
      break;
    }
    case "notion":
    case "slack":
    default: {
      const project = firstMatch(message, PROJECT_PATTERNS);
      if (project) params.projectName = project;
      const person = extractPersonName(message, project);
      if (person) params.personName = person;
      break;
    }
  }

  return params;
}

// --- Public API ---------------------------------------------------------------

/**
 * Full natural-language → structured Composio query parser.
 *
 * Detects the target toolkit, the kind of action (read/write/send/delete),
 * picks a concrete registry action, and extracts whatever structured
 * parameters the message contains (people, projects, dates, statuses,
 * toolkit-specific filters). Returns `null` when no supported toolkit is
 * mentioned at all — callers should not invoke the gateway in that case.
 */
export function parseComposioQuery(message: string): ParsedComposioQuery | null {
  const detection = detectToolkit(message);
  if (!detection) return null;

  const { toolkit } = detection;
  const parseWarnings: string[] = [];
  if (detection.warning) parseWarnings.push(detection.warning);

  const { risk, matched } = detectActionRisk(message);
  if (!matched) {
    parseWarnings.push("No se detectó un verbo de acción explícito; se asumió una consulta de lectura.");
  }

  const { action, warnings: actionWarnings } = selectAction(toolkit, risk);
  parseWarnings.push(...actionWarnings);
  if (!action) return null;

  const params: Record<string, unknown> = extractToolkitParams(message, toolkit);

  const dateRange = extractDateRange(message);
  if (dateRange) params.dateRange = dateRange;

  const statusFilter = extractStatusFilter(message);
  if (statusFilter) params.statusFilter = statusFilter;

  if (!("query" in params)) {
    const query =
      (typeof params.personName === "string" && params.personName) ||
      (typeof params.projectName === "string" && params.projectName) ||
      (typeof params.repoName === "string" && params.repoName) ||
      (typeof params.subject === "string" && params.subject) ||
      extractGenericQuery(message);
    if (query) params.query = query;
  }

  let confidence = detection.confidence;
  confidence += matched ? 0.05 : -0.1;
  const paramCount = Object.keys(params).filter((k) => k !== "query").length;
  confidence += Math.min(0.1, paramCount * 0.02);
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  return {
    toolkit,
    action,
    params,
    naturalLanguageGoal: message.trim(),
    confidence,
    parseWarnings,
  };
}

/** Converts a parsed query into the `ComposioToolRequest` shape the adapters expect. */
export function toToolRequest(parsed: ParsedComposioQuery): ComposioToolRequest {
  return {
    toolkit: parsed.toolkit,
    action: parsed.action,
    params: parsed.params,
    naturalLanguageGoal: parsed.naturalLanguageGoal,
  };
}

/**
 * Convenience wrapper combining `parseComposioQuery` + `toToolRequest`.
 * Returns `null` when no supported toolkit/action could be identified.
 */
export function parseComposioRequest(message: string): ComposioToolRequest | null {
  const parsed = parseComposioQuery(message);
  return parsed ? toToolRequest(parsed) : null;
}
