import { getDb } from "./db.js";

export async function createApproval(data: {
  toolCallId?: string;
  toolName: string;
  summary: string;
  args: unknown;
  riskLevel: string;
}) {
  return getDb().approval.create({
    data: {
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      summary: data.summary,
      args: JSON.stringify(data.args),
      riskLevel: data.riskLevel,
      status: "pending",
    },
  });
}

export async function resolveApproval(id: string, approved: boolean) {
  return getDb().approval.update({
    where: { id },
    data: {
      status: approved ? "approved" : "rejected",
      resolvedAt: new Date(),
    },
  });
}

export async function getApproval(id: string) {
  return getDb().approval.findUnique({ where: { id } });
}
