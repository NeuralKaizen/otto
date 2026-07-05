export type ApprovalRisk = "read" | "write" | "send" | "delete" | "unknown";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  args: unknown;
  createdAt: string;
  expiresAt: string;
  // Optional richer fields for dynamic (skill-driven) approvals, e.g. Composio.
  skillName?: string;
  title?: string;
  description?: string;
  risk?: ApprovalRisk;
  toolkit?: string;
  action?: string;
  paramsPreview?: Record<string, unknown>;
}

export interface ApprovalDecision {
  approvalId: string;
  approved: boolean;
  reason?: string;
}

/** What a skill needs in order to resume execution after a dynamic approval is granted. */
export interface PendingSkillExecution {
  skillName: string;
  input: unknown;
  risk?: ApprovalRisk;
  toolkit?: string;
  action?: string;
}

/**
 * Standard envelope a skill can return from `execute()` to signal that an
 * action needs human approval before running, instead of (or in addition to)
 * its normal result.
 */
export interface SkillExecutionResult {
  success: boolean;
  data?: unknown;
  message?: string;
  requiresApproval?: boolean;
  approvalRequest?: ApprovalRequest;
  pendingExecution?: PendingSkillExecution;
}

/**
 * Result of a skill's `preflight()` check, run by the executor before the
 * normal tool-call flow. "proceed" means the executor should call
 * `execute()` as usual (covers both normal runs and policy-blocked results
 * the skill already handles internally). "requires_approval" pauses
 * execution, emits `approval_requested`, and waits for a decision before
 * re-invoking `execute()` with `pendingExecution.input`.
 */
export type SkillPreflightResult =
  | { status: "proceed" }
  | { status: "requires_approval"; approvalRequest: ApprovalRequest; pendingExecution: PendingSkillExecution };
