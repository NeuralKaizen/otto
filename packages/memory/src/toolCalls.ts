import { getDb } from "./db.js";

export async function logToolCall(data: {
  conversationId?: string;
  toolName: string;
  args: unknown;
  riskLevel: string;
  status: string;
  result?: unknown;
}) {
  return getDb().toolCall.create({
    data: {
      conversationId: data.conversationId,
      toolName: data.toolName,
      args: JSON.stringify(data.args),
      riskLevel: data.riskLevel,
      status: data.status,
      result: data.result ? JSON.stringify(data.result) : null,
    },
  });
}

export async function completeToolCall(id: string, result: unknown, status = "completed") {
  return getDb().toolCall.update({
    where: { id },
    data: { result: JSON.stringify(result), status, completedAt: new Date() },
  });
}
