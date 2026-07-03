import type { AgentEvent, SkillPreflightResult } from "@jarvis/shared";

export interface AgentInput {
  conversationId?: string;
  userMessage: string;
  source: "web" | "voice" | "cli";
}

export interface AgentRunResult {
  conversationId: string;
  assistantMessageId: string;
  finalContent: string;
}

export type EventEmitter = (event: AgentEvent) => void;

/** Lightweight social context passed from the session registry to skills. */
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

export interface SkillLike {
  name: string;
  description: string;
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high";
  execute: (
    args: { message: string },
    ctx: { conversationId?: string; emit?: EventEmitter; socialContext?: SocialFollowUpContext }
  ) => Promise<unknown>;
  /**
   * Optional pre-execution policy check. Lets a skill pause the executor and
   * request human approval (with full toolkit/action/risk context) *after*
   * evaluating the user's request, without the executor having to know
   * anything about the skill's internal policy logic.
   */
  preflight?: (
    args: { message: string },
    ctx: { conversationId?: string; emit?: EventEmitter }
  ) => Promise<SkillPreflightResult>;
}
