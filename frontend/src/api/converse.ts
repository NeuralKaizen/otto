import type { RenderedWidget } from "../voice/types";

const BASE = "http://localhost:8000";

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
