export interface NormalizedComposioEvent {
  id: string;
  title?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  location?: string;
  url?: string;
}

export interface NormalizedComposioCalendarResult {
  events: NormalizedComposioEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function eventTime(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.dateTime === "string") return value.dateTime;
  if (typeof value.date === "string") return value.date;
  return undefined;
}

function extractAttendees(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .filter(isRecord)
    .map((a) => (typeof a.displayName === "string" ? a.displayName : typeof a.email === "string" ? a.email : undefined))
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names : undefined;
}

/** Normalizes the response from GOOGLECALENDAR_FIND_EVENT (`items`) into a simple event list. */
export function normalizeCalendarResult(data: unknown): NormalizedComposioCalendarResult {
  if (!isRecord(data)) return { events: [] };

  const items = Array.isArray(data.items) ? data.items : [];

  const events: NormalizedComposioEvent[] = items.filter(isRecord).map((item) => ({
    id: typeof item.id === "string" ? item.id : "",
    title: typeof item.summary === "string" ? item.summary : undefined,
    start: eventTime(item.start),
    end: eventTime(item.end),
    attendees: extractAttendees(item.attendees),
    location: typeof item.location === "string" ? item.location : undefined,
    url: typeof item.htmlLink === "string" ? item.htmlLink : undefined,
  }));

  return { events };
}
