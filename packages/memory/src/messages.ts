import { getDb } from "./db.js";

export async function addMessage(
  conversationId: string,
  role: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  return getDb().message.create({
    data: {
      conversationId,
      role,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function getMessages(conversationId: string, limit = 50) {
  return getDb().message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
