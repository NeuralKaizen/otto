import type { ChatInputMessage } from "./model/types.js";
import { SYSTEM_PROMPT } from "./prompts/systemPrompt.js";

export interface ConversationMessage {
  role: string;
  content: string;
}

export interface SocialContextSnapshot {
  username: string;
  platform: string;
  summary?: string;
  dataSource?: string;
  lastToolName?: string;
  topPosts?: Array<{
    title?: string;
    url?: string;
    views?: number;
    impressions?: number;
    engagement?: number;
  }>;
  recentContent?: Array<{
    title?: string;
    url?: string;
    views?: number;
    impressions?: number;
    engagement?: number;
  }>;
}

export interface PromptContext {
  conversationHistory: ConversationMessage[];
  relevantMemories: { title: string; content: string }[];
  availableSkills: string[];
  /** If set, injects a lightweight social session context into the system prompt. */
  socialContext?: SocialContextSnapshot;
}

export function buildPrompt(userMessage: string, ctx: PromptContext): ChatInputMessage[] {
  const messages: ChatInputMessage[] = [];

  let systemContent = SYSTEM_PROMPT;

  if (ctx.relevantMemories.length > 0) {
    systemContent += "\n\nMemoria relevante:\n";
    for (const m of ctx.relevantMemories) {
      systemContent += `- ${m.title}: ${m.content}\n`;
    }
  }

  if (ctx.availableSkills.length > 0) {
    systemContent += `\n\nSkills disponibles: ${ctx.availableSkills.join(", ")}`;
  }

  if (ctx.socialContext) {
    const sc = ctx.socialContext;
    systemContent += `\n\n## Contexto de sesión actual\n- Última consulta social: @${sc.username} en ${sc.platform}`;
    if (sc.summary) {
      systemContent += `\n- Resumen: ${sc.summary.slice(0, 200)}`;
    }
    if (sc.dataSource) {
      systemContent += `\n- Fuente reciente: ${sc.dataSource}`;
    }
    systemContent +=
      "\n- Si el usuario hace follow-up sobre métricas sin mencionar username, asume que sigue hablando de @" +
      sc.username +
      " en " +
      sc.platform +
      ".";
  }

  messages.push({ role: "system", content: systemContent });

  for (const msg of ctx.conversationHistory.slice(-10)) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  return messages;
}
