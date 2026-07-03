export interface NormalizedComposioEmail {
  id: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
}

export interface NormalizedComposioGmailResult {
  emails: NormalizedComposioEmail[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function header(message: Record<string, unknown>, name: string): string | undefined {
  const payload = message.payload;
  if (!isRecord(payload) || !Array.isArray(payload.headers)) return undefined;

  const match = payload.headers.find(
    (h) => isRecord(h) && typeof h.name === "string" && h.name.toLowerCase() === name.toLowerCase()
  );
  return isRecord(match) && typeof match.value === "string" ? match.value : undefined;
}

function fromMessage(message: Record<string, unknown>): NormalizedComposioEmail {
  return {
    id: typeof message.id === "string" ? message.id : "",
    subject: header(message, "Subject"),
    from: header(message, "From"),
    date: header(message, "Date"),
    snippet: typeof message.snippet === "string" ? message.snippet : undefined,
  };
}

/** Normalizes responses from GMAIL_FETCH_EMAILS (`messages`) or GMAIL_LIST_DRAFTS (`drafts`). */
export function normalizeGmailResult(data: unknown): NormalizedComposioGmailResult {
  if (!isRecord(data)) return { emails: [] };

  if (Array.isArray(data.messages)) {
    return { emails: data.messages.filter(isRecord).map(fromMessage) };
  }

  if (Array.isArray(data.drafts)) {
    const emails = data.drafts.filter(isRecord).map((draft) => {
      const message = isRecord(draft.message) ? draft.message : draft;
      return fromMessage(message);
    });
    return { emails };
  }

  return { emails: [] };
}
