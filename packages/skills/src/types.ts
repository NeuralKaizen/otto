import type { AgentEvent, SkillPreflightResult } from "@jarvis/shared";

/** Lightweight social context carried across follow-up turns within the same conversation. */
export interface SocialFollowUpContext {
  platform: string;
  username: string;
  summary?: string;
  dataSource?: string;
  lastToolName?: string;
  topPosts?: Array<{
    id?: string;
    platform?: string;
    title?: string;
    url?: string;
    publishedAt?: string;
    views?: number;
    impressions?: number;
    engagement?: number;
  }>;
  recentContent?: Array<{
    id?: string;
    platform?: string;
    title?: string;
    url?: string;
    publishedAt?: string;
    views?: number;
    impressions?: number;
    engagement?: number;
  }>;
}

export interface SkillContext {
  conversationId?: string;
  userId?: string;
  emit?: (event: AgentEvent) => void;
  /** Populated by the executor when a prior social query exists for this conversation. */
  socialContext?: SocialFollowUpContext;
}

export interface SkillDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: unknown;
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high";
  permissions: string[];
  execute: (args: TArgs, context: SkillContext) => Promise<TResult>;
  /**
   * Optional dynamic approval check, run by the executor before `execute()`.
   * Lets a skill decide — based on its own policy — that a specific request
   * needs human approval, without the executor or planner knowing about that
   * policy. See `@jarvis/shared`'s `SkillPreflightResult`.
   */
  preflight?: (args: TArgs, context: SkillContext) => Promise<SkillPreflightResult>;
}
