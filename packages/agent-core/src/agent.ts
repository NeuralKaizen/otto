import { randomUUID } from "crypto";
import type { AgentEvent } from "@wattson/shared";
import {
  createConversation,
  getConversation,
  addMessage,
  searchMemories,
} from "@wattson/memory";
import { routeIntent } from "./router.js";
import { createPlan } from "./planner.js";
import { executePlan } from "./executor.js";
import type { SkillRegistry } from "./executor.js";
import { buildPrompt } from "./promptBuilder.js";
import { createProvider, getProviderInfo } from "./model/providerFactory.js";
import { isCancelled, clearCancelled } from "./cancellationRegistry.js";
import {
  getSocialContext,
  setSocialContext,
  type SocialSessionContentItem,
  type SocialSessionContext,
} from "./sessionContextRegistry.js";
import type { AgentInput, AgentRunResult, EventEmitter } from "./types.js";

let _skillRegistry: SkillRegistry | null = null;

export function registerSkillRegistry(registry: SkillRegistry): void {
  _skillRegistry = registry;
}

const provider = createProvider();

function ts(): string {
  return new Date().toISOString();
}

const SOCIAL_FOLLOW_UP_PATTERNS = [
  "esa cuenta",
  "esta cuenta",
  "de esa cuenta",
  "de esta cuenta",
  "videos más vistos",
  "videos mas vistos",
  "reels más vistos",
  "reels mas vistos",
  "publicaciones más vistas",
  "publicaciones mas vistas",
  "top posts",
  "mejores posts",
  "contenido con más vistas",
  "contenido con mas vistas",
  "qué contenido funcionó mejor",
  "que contenido funciono mejor",
  "compara",
  "comparar",
  "comparalo",
  "en tiktok",
  "en instagram",
  "en youtube",
  "y tiktok",
  "y instagram",
  "y youtube",
  "mejorar",
  "engagement",
  "followers",
  "crecimiento",
  "recomiendas",
  "recomienda",
  "qué tan bueno",
  "que tan bueno",
];

export function hasSocialFollowUpSignals(message: string): boolean {
  const normalized = message.toLowerCase();
  return SOCIAL_FOLLOW_UP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitizeSocialContentItems(items: unknown[], fallbackPlatform: string): SocialSessionContentItem[] {
  const sanitized: SocialSessionContentItem[] = [];
  const seen = new Set<string>();

  for (const entry of items) {
    const item = entry as {
      id?: string;
      platform?: string;
      title?: string;
      url?: string;
      publishedAt?: string;
      views?: number;
      impressions?: number;
      engagement?: number;
    } | null;

    if (!item) continue;

    const key = item.id ?? item.url ?? item.title ?? `${item.publishedAt ?? "unknown"}:${item.views ?? item.impressions ?? item.engagement ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);

    sanitized.push({
      id: item.id,
      platform: item.platform ?? fallbackPlatform,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      views: item.views,
      impressions: item.impressions,
      engagement: item.engagement,
    });

    if (sanitized.length >= 5) break;
  }

  return sanitized;
}

export function buildSocialSessionContext(rawSkillResult: unknown): SocialSessionContext | undefined {
  const result = rawSkillResult as {
    request?: { platform?: string; username?: string };
    summary?: string;
    dataSource?: string;
    warnings?: string[];
    profiles?: Array<{
      platform?: string;
      topPosts?: unknown[];
      recentContent?: unknown[];
    }>;
  } | null;

  if (!result?.request?.username) {
    return undefined;
  }

  const fallbackPlatform = result.request.platform ?? "all";
  const profiles = Array.isArray(result.profiles) ? result.profiles : [];
  const topPosts = sanitizeSocialContentItems(
    profiles.flatMap((profile) =>
      (profile.topPosts ?? []).map((item) => ({
        ...(item as Record<string, unknown>),
        platform: profile.platform ?? fallbackPlatform,
      }))
    ),
    fallbackPlatform
  );
  const recentContent = sanitizeSocialContentItems(
    profiles.flatMap((profile) =>
      (profile.recentContent ?? []).map((item) => ({
        ...(item as Record<string, unknown>),
        platform: profile.platform ?? fallbackPlatform,
      }))
    ),
    fallbackPlatform
  );

  return {
    platform: fallbackPlatform,
    username: result.request.username,
    summary: result.summary ?? "",
    dataSource: result.dataSource ?? "mock",
    lastToolName: "social_metrics_lookup",
    topPosts,
    recentContent,
    warnings: (result.warnings ?? []).slice(0, 3),
    timestamp: new Date().toISOString(),
  };
}

export async function runAgent(input: AgentInput, emit: EventEmitter): Promise<AgentRunResult> {
  console.log(`[agent] message received: "${input.userMessage.slice(0, 80)}"`);
  emit({ type: "status", status: "thinking", timestamp: ts() });

  let { conversationId } = input;
  if (!conversationId) {
    const conv = await createConversation();
    conversationId = conv.id;
  }

  await addMessage(conversationId, "user", input.userMessage);
  const resolvedInput = { ...input, conversationId };

  const conversation = await getConversation(conversationId);
  const history = (conversation?.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const memories = await searchMemories(input.userMessage, 3);
  const skillList = _skillRegistry?.listSkills().map((s) => s.name) ?? [];

  let intent = routeIntent(input.userMessage);

  // Social follow-up override: if the router can't classify the message but there is
  // a recent social context, check for cross-platform comparison or improvement queries
  // that should re-run social_metrics using the stored username as fallback.
  const preSocialCtx = getSocialContext(conversationId);
  if (intent === "unknown" && preSocialCtx) {
    if (hasSocialFollowUpSignals(input.userMessage)) {
      intent = "social_metrics";
      console.log(`[agent] intent overridden to social_metrics (social follow-up, ctx: @${preSocialCtx.username})`);
    }
  }

  console.log(`[agent] intent detected: ${intent}`);
  emit({ type: "intent_detected", intent, timestamp: ts() });

  const plan = createPlan(intent);
  console.log(`[agent] plan created: skill=${plan.skillName ?? "none"}, approval=${plan.requiresApproval}`);
  emit({
    type: "plan_created",
    intent,
    skillName: plan.skillName,
    requiresApproval: plan.requiresApproval,
    timestamp: ts(),
  });

  const registry = _skillRegistry ?? { getSkill: () => undefined, listSkills: () => [] };
  const { toolResultContext, cancelled, cancelledMessage, rawSkillResult, executedSkillName } = await executePlan(
    plan,
    resolvedInput,
    emit,
    registry
  );

  // Store social context for follow-up turns (sanitized, no raw payloads or secrets).
  if (!cancelled && executedSkillName === "social_metrics_lookup" && rawSkillResult) {
    const nextSocialContext = buildSocialSessionContext(rawSkillResult);
    if (nextSocialContext) {
      setSocialContext(conversationId, nextSocialContext);
    }
  }

  if (cancelled) {
    const content = cancelledMessage ?? "Acción cancelada. No se ejecutó ninguna operación.";
    const savedMsg = await addMessage(conversationId, "assistant", content);
    const msgId = randomUUID();
    emit({ type: "message_done", messageId: msgId, content, timestamp: ts() });
    emit({ type: "status", status: "idle", timestamp: ts() });
    console.log(`[agent] run cancelled (approval rejected)`);
    return { conversationId, assistantMessageId: savedMsg.id, finalContent: content };
  }

  emit({ type: "status", status: "responding", timestamp: ts() });

  const latestSocialCtx = getSocialContext(conversationId);
  const promptMessages = buildPrompt(input.userMessage + toolResultContext, {
    conversationHistory: history,
    relevantMemories: memories.map((m) => ({ title: m.title, content: m.content })),
    availableSkills: skillList,
    socialContext: latestSocialCtx
      ? {
          username: latestSocialCtx.username,
          platform: latestSocialCtx.platform,
          summary: latestSocialCtx.summary,
          dataSource: latestSocialCtx.dataSource,
          lastToolName: latestSocialCtx.lastToolName,
          topPosts: latestSocialCtx.topPosts,
          recentContent: latestSocialCtx.recentContent,
        }
      : undefined,
  });

  const assistantMsgId = randomUUID();
  const providerInfo = getProviderInfo();
  const enableStreaming = process.env.ENABLE_STREAMING !== "false";

  emit({
    type: "message_started",
    messageId: assistantMsgId,
    provider: providerInfo.active,
    model: providerInfo.model ?? undefined,
    timestamp: ts(),
  });

  let finalContent = "";
  let wasCancelled = false;

  if (enableStreaming) {
    for await (const chunk of provider.streamChat({ messages: promptMessages })) {
      if (isCancelled(assistantMsgId)) {
        wasCancelled = true;
        break;
      }
      if (chunk.delta) {
        finalContent += chunk.delta;
        emit({ type: "message_delta", messageId: assistantMsgId, delta: chunk.delta, timestamp: ts() });
      }
    }
  } else {
    const response = await provider.complete({ messages: promptMessages });
    finalContent = response.content;
    emit({ type: "message_delta", messageId: assistantMsgId, delta: finalContent, timestamp: ts() });
  }

  clearCancelled(assistantMsgId);

  emit({
    type: "message_done",
    messageId: assistantMsgId,
    content: finalContent,
    provider: providerInfo.active,
    model: providerInfo.model ?? undefined,
    cancelled: wasCancelled || undefined,
    timestamp: ts(),
  });
  emit({ type: "status", status: wasCancelled ? "idle" : "done", timestamp: ts() });

  const savedMsg = await addMessage(conversationId, "assistant", finalContent || "[cancelado]");
  console.log(`[agent] run complete, conversationId=${conversationId}`);

  return { conversationId, assistantMessageId: savedMsg.id, finalContent };
}
