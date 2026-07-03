import type { NotionActionName, ParsedNotionAction } from "./types.js";

const UUID_PATTERN = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;

function trimPunctuation(value: string): string {
  return value.trim().replace(/^[\s:,-]+|[\s.?!]+$/g, "");
}

function extractAfterColon(message: string): string | undefined {
  const idx = message.indexOf(":");
  if (idx === -1) return undefined;
  const content = trimPunctuation(message.slice(idx + 1));
  return content.length > 0 ? content : undefined;
}

function extractQuoted(message: string): string | undefined {
  const match = message.match(/["“](.+?)["”]/);
  return match?.[1] ? trimPunctuation(match[1]) : undefined;
}

function extractPageId(message: string): string | undefined {
  return message.match(UUID_PATTERN)?.[0];
}

function detectAction(message: string): NotionActionName {
  const m = message.toLowerCase();

  if (/\bactualiza|actualizar|cambia|cambiar\b/.test(m)) {
    if (/\btarea|task\b/.test(m)) return "notion_update_task";
    return "notion_update_page";
  }

  if (/\bcrea|crear|agrega|agregar|añade|añadir|guarda\b/.test(m)) {
    if (/\btarea|task|pendiente\b/.test(m)) return "notion_create_task";
    return "notion_create_page";
  }

  if (/\blee|leer|abre|abrir|revisa|revisar|muestra|mostrar\b/.test(m) && /\bp[aá]gina\b/.test(m)) {
    return "notion_read_page";
  }

  return "notion_search";
}

function inferStatus(message: string): string | undefined {
  const m = message.toLowerCase();
  if (/\bdone|hech[oa]|completad[oa]\b/.test(m)) return "Done";
  if (/\ben progreso|in progress\b/.test(m)) return "In Progress";
  if (/\bbloquead[oa]\b/.test(m)) return "Blocked";
  if (/\bpendiente\b/.test(m)) return "Pending";
  return undefined;
}

function inferQuery(message: string): string | undefined {
  const afterColon = extractAfterColon(message);
  if (afterColon) return afterColon;

  const quoted = extractQuoted(message);
  if (quoted) return quoted;

  const match = message.match(/(?:sobre|de|la p[aá]gina|el proyecto|el resumen de)\s+(.+)$/i);
  return match?.[1] ? trimPunctuation(match[1]) : undefined;
}

function inferTitle(message: string, action: NotionActionName): string | undefined {
  const afterColon = extractAfterColon(message);
  if (afterColon) return afterColon.slice(0, 120);

  const quoted = extractQuoted(message);
  if (quoted) return quoted.slice(0, 120);

  if (action === "notion_create_page" && /esta conversaci[oó]n/i.test(message)) {
    return "Resumen de conversación";
  }

  const match = message.match(/(?:p[aá]gina|tarea|nota)\s+(?:en\s+notion\s+)?(?:sobre|de)\s+(.+)$/i);
  return match?.[1] ? trimPunctuation(match[1]).slice(0, 120) : undefined;
}

function inferBody(message: string): string | undefined {
  const afterColon = extractAfterColon(message);
  if (afterColon) return afterColon;
  return undefined;
}

function inferProjectOrPerson(message: string): { projectName?: string; personName?: string } {
  const projectMatch = message.match(/\bproyecto\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ0-9 -]+)/i);
  const personMatch = message.match(/\bde\s+([A-ZÀ-Þ][\wÀ-ÿ'-]*(?:\s+[A-ZÀ-Þ][\wÀ-ÿ'-]*)?)/);

  return {
    projectName: projectMatch?.[1] ? trimPunctuation(projectMatch[1]) : undefined,
    personName: personMatch?.[1] ? trimPunctuation(personMatch[1]) : undefined,
  };
}

export function parseNotionAction(message: string): ParsedNotionAction {
  const action = detectAction(message);
  const risk = action === "notion_search" || action === "notion_read_page" ? "read" : "write";
  const query = inferQuery(message);
  const title = inferTitle(message, action);
  const body = inferBody(message);
  const status = inferStatus(message);
  const pageId = extractPageId(message);
  const wantsPendingTasks = /\btareas?|task|pendientes?|bloqueadas?|vencidas?\b/i.test(message);
  const wantsRecentPages = /\brecientes?|recent\b/i.test(message);
  const { projectName, personName } = inferProjectOrPerson(message);

  return {
    action,
    risk,
    rawQuery: message,
    query,
    title,
    body,
    status,
    pageId,
    pageTitle: action === "notion_read_page" || action === "notion_update_page" ? title ?? query : undefined,
    projectName,
    personName,
    wantsPendingTasks,
    wantsRecentPages,
  };
}
