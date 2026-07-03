export type Role = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
