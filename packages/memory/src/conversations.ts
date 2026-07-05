import { getDb } from "./db.js";

export async function createConversation(title?: string) {
  return getDb().conversation.create({ data: { title } });
}

export async function getConversation(id: string) {
  return getDb().conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function listConversations(limit = 20) {
  return getDb().conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });
}
