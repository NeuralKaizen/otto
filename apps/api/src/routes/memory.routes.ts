import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchMemories, saveMemory, listMemories } from "@jarvis/memory";

const saveMemorySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  kind: z.enum(["preference", "project", "fact", "instruction"]).default("fact"),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});

export function memoryRoutes(app: FastifyInstance): void {
  app.get("/memory", async (req, reply) => {
    const query = (req.query as Record<string, string>).query;
    const memories = query ? await searchMemories(query, 20) : await listMemories(20);
    reply.send({ ok: true, data: memories });
  });

  app.post("/memory", async (req, reply) => {
    const parsed = saveMemorySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }
    const record = await saveMemory(parsed.data);
    reply.status(201).send({ ok: true, data: record });
  });
}
