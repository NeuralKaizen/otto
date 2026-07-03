import type { ApprovalRequest, PendingSkillExecution } from "@wattson/shared";

export type PendingApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface PendingApprovalRecord {
  approvalId: string;
  approvalRequest: ApprovalRequest;
  pendingExecution: PendingSkillExecution;
  status: PendingApprovalStatus;
  createdAt: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const pending = new Map<string, PendingApprovalRecord>();

function ttlMs(): number {
  const raw = process.env.APPROVAL_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

/**
 * Registers a skill-driven approval request awaiting a human decision.
 * Stores only the sanitized request/execution info the skill produced —
 * never raw API keys or secrets. Entries expire automatically after
 * APPROVAL_TIMEOUT_MS (default 5 minutes) if never resolved.
 */
export function createPendingApproval(
  approvalRequest: ApprovalRequest,
  pendingExecution: PendingSkillExecution
): PendingApprovalRecord {
  const record: PendingApprovalRecord = {
    approvalId: approvalRequest.id,
    approvalRequest,
    pendingExecution,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  pending.set(record.approvalId, record);

  setTimeout(() => {
    const current = pending.get(record.approvalId);
    if (current?.status === "pending") {
      current.status = "expired";
      pending.delete(record.approvalId);
    }
  }, ttlMs());

  return record;
}

export function getPendingApproval(approvalId: string): PendingApprovalRecord | undefined {
  return pending.get(approvalId);
}

/** Marks a pending approval resolved (approved/rejected) and removes it from the registry. */
export function resolvePendingApproval(approvalId: string, approved: boolean): PendingApprovalRecord | undefined {
  const record = pending.get(approvalId);
  if (!record) return undefined;
  record.status = approved ? "approved" : "rejected";
  pending.delete(approvalId);
  return record;
}

export function removePendingApproval(approvalId: string): void {
  pending.delete(approvalId);
}
