import type { AgentEvent, AgentStatus, ApprovalRisk } from "@jarvis/shared";

export type { AgentEvent, AgentStatus, ApprovalRisk };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  cancelled?: boolean;
  provider?: string;
  model?: string;
  timestamp: string;
}

export interface DisplayToolCall {
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
}

export interface DisplayApproval {
  id: string;
  toolName: string;
  summary: string;
  args: unknown;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  risk?: ApprovalRisk;
  toolkit?: string;
  action?: string;
}
