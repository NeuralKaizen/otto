import { saveMemory as dbSaveMemory } from "@wattson/memory";
import type { SkillDefinition, SkillContext } from "../types.js";

interface SaveMemoryInput {
  message: string;
  title?: string;
  kind?: "preference" | "project" | "fact" | "instruction";
  tags?: string[];
}

interface SaveMemoryOutput {
  saved: boolean;
  id: string;
  title: string;
  kind: string;
}

function extractTitle(message: string): string {
  const cleaned = message
    .replace(/^(recuerda|guarda|anota|remember|wattson)[,\s]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 80 ? cleaned.slice(0, 80) + "…" : cleaned;
}

function detectKind(message: string): "preference" | "project" | "fact" | "instruction" {
  const m = message.toLowerCase();
  if (m.includes("proyecto") || m.includes("project")) return "project";
  if (m.includes("prefiero") || m.includes("me gusta") || m.includes("prefer")) return "preference";
  if (m.includes("siempre") || m.includes("nunca") || m.includes("regla") || m.includes("always")) return "instruction";
  return "fact";
}

export const saveMemorySkill: SkillDefinition<SaveMemoryInput, SaveMemoryOutput> = {
  name: "saveMemory",
  description: "Guarda información en la memoria de Wattson para recordarla en futuras conversaciones",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      title: { type: "string" },
      kind: { type: "string", enum: ["preference", "project", "fact", "instruction"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["memory:write"],

  async execute(args: SaveMemoryInput, _ctx: SkillContext): Promise<SaveMemoryOutput> {
    const title = args.title ?? extractTitle(args.message);
    const kind = args.kind ?? detectKind(args.message);

    const record = await dbSaveMemory({
      title,
      content: args.message,
      kind,
      tags: args.tags,
    });

    return { saved: true, id: record.id, title, kind };
  },
};
