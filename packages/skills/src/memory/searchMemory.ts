import { searchMemories as dbSearch } from "@jarvis/memory";
import type { SkillDefinition, SkillContext } from "../types.js";

interface SearchMemoryInput {
  message: string;
  query?: string;
  limit?: number;
}

interface MemoryResult {
  id: string;
  title: string;
  content: string;
  kind: string;
  tags: string[];
  createdAt: string;
}

interface SearchMemoryOutput {
  results: MemoryResult[];
  total: number;
}

function extractQuery(message: string): string {
  return message
    .replace(/^(qué recuerdas|que recuerdas|busca en memoria|tienes guardado sobre|what do you remember about)[,\s]*/i, "")
    .replace(/^(jarvis)[,\s]*/i, "")
    .trim() || message;
}

export const searchMemorySkill: SkillDefinition<SearchMemoryInput, SearchMemoryOutput> = {
  name: "searchMemory",
  description: "Busca en la memoria de Jarvis información guardada previamente",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["memory:read"],

  async execute(args: SearchMemoryInput, _ctx: SkillContext): Promise<SearchMemoryOutput> {
    const query = args.query ?? extractQuery(args.message);
    const memories = await dbSearch(query, args.limit ?? 5);

    const results: MemoryResult[] = memories.map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      kind: m.kind,
      tags: m.tags ? m.tags.split(",").filter(Boolean) : [],
      createdAt: m.createdAt.toISOString(),
    }));

    return { results, total: results.length };
  },
};
