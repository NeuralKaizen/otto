import { getDb } from "./db.js";

export interface SaveMemoryInput {
  kind: string;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
}

export async function saveMemory(input: SaveMemoryInput) {
  return getDb().memory.create({
    data: {
      kind: input.kind,
      title: input.title,
      content: input.content,
      source: input.source,
      tags: input.tags?.join(","),
    },
  });
}

export async function searchMemories(query: string, limit = 10) {
  const term = query.toLowerCase();
  const all = await getDb().memory.findMany({ orderBy: { createdAt: "desc" } });
  return all
    .filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        m.content.toLowerCase().includes(term) ||
        (m.tags ?? "").toLowerCase().includes(term)
    )
    .slice(0, limit);
}

export async function listMemories(limit = 20) {
  return getDb().memory.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
