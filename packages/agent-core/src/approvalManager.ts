import type { ApprovalRequest, ApprovalDecision } from "@jarvis/shared";

type ApprovalResolver = (decision: ApprovalDecision) => void;

export class ApprovalManager {
  private pending = new Map<string, ApprovalResolver>();

  waitForDecision(request: ApprovalRequest): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      const timeout = parseInt(process.env.APPROVAL_TIMEOUT_MS ?? "300000", 10);
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        resolve({ approvalId: request.id, approved: false, reason: "timeout" });
      }, timeout);

      this.pending.set(request.id, (decision) => {
        clearTimeout(timer);
        resolve(decision);
      });
    });
  }

  resolve(decision: ApprovalDecision): boolean {
    const resolver = this.pending.get(decision.approvalId);
    if (!resolver) return false;
    this.pending.delete(decision.approvalId);
    resolver(decision);
    return true;
  }

  hasPending(id: string): boolean {
    return this.pending.has(id);
  }
}

export const approvalManager = new ApprovalManager();
