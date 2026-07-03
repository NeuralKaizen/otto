import type { FastifyInstance } from "fastify";
import { listSkills } from "@jarvis/skills";

export function skillsRoutes(app: FastifyInstance): void {
  app.get("/skills", async (_req, reply) => {
    const skills = listSkills().map((s) => ({
      name: s.name,
      description: s.description,
      requiresApproval: s.requiresApproval,
      riskLevel: s.riskLevel,
      permissions: s.permissions,
    }));
    reply.send({ ok: true, data: skills });
  });
}
