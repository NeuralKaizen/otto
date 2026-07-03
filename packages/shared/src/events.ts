import type { AgentStatus } from "./agentStatus.js";
import type { Intent } from "./intents.js";
import type { ApprovalRisk } from "./approvals.js";

export type AgentEvent =
  | { type: "status"; status: AgentStatus; timestamp: string }
  | { type: "intent_detected"; intent: Intent; timestamp: string }
  | { type: "plan_created"; intent: Intent; skillName: string | null; requiresApproval: boolean; timestamp: string }
  | { type: "message_started"; messageId: string; provider: string; model?: string; timestamp: string }
  | { type: "message_delta"; messageId: string; delta: string; timestamp: string }
  | { type: "message_done"; messageId: string; content: string; provider?: string; model?: string; cancelled?: boolean; timestamp: string }
  | { type: "tool_call_started"; toolCallId: string; toolName: string; args: unknown; timestamp: string }
  | { type: "tool_call_completed"; toolCallId: string; toolName: string; result: unknown; timestamp: string }
  | { type: "approval_requested"; approvalId: string; toolName: string; summary: string; args: unknown; timestamp: string; risk?: ApprovalRisk; toolkit?: string; action?: string; skillName?: string }
  | { type: "approval_resolved"; approvalId: string; approved: boolean; timestamp: string }
  | { type: "error"; error: string; timestamp: string };
