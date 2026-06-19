import type { RenderedWidget } from "../voice/types";

// En dev el backend corre aparte en :8000; en producción (Vercel) el
// service FastAPI vive same-origin bajo /_/backend (ver vercel.json).
const BASE = import.meta.env.DEV ? "http://localhost:8000" : "/_/backend";

export interface ConverseResult {
  narration: string;
  widgets: RenderedWidget[];
}

export async function callConverse(text: string): Promise<ConverseResult> {
  const resp = await fetch(`${BASE}/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`converse failed: ${resp.status}`);
  return (await resp.json()) as ConverseResult;
}
