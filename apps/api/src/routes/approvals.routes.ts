import type { FastifyInstance } from "fastify";
import { approvalManager } from "@wattson/agent-core";
import { resolveApproval } from "@wattson/memory";
import { broadcast } from "../ws/eventBus.js";

export function approvalsRoutes(app: FastifyInstance): void {
  app.post("/approvals/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    await resolveApproval(id, true);
    const resolved = approvalManager.resolve({ approvalId: id, approved: true });
    broadcast({ type: "approval_resolved", approvalId: id, approved: true, timestamp: new Date().toISOString() });
    reply.send({ ok: true, data: { resolved } });
  });

  app.post("/approvals/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body as { reason?: string }) ?? {};
    await resolveApproval(id, false);
    const resolved = approvalManager.resolve({ approvalId: id, approved: false, reason });
    broadcast({ type: "approval_resolved", approvalId: id, approved: false, timestamp: new Date().toISOString() });
    reply.send({ ok: true, data: { resolved } });
  });
}
