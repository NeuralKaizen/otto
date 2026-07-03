import { randomUUID } from "crypto";
import type { AgentPlan, ApprovalRequest } from "@wattson/shared";
import type { AgentInput, EventEmitter, SkillLike } from "./types.js";
import { approvalManager } from "./approvalManager.js";
import { checkPermissions } from "./permissions.js";
import { createPendingApproval, resolvePendingApproval } from "./approvalRegistry.js";
import { getSocialContext } from "./sessionContextRegistry.js";
import {
  createApproval,
  resolveApproval,
  logToolCall,
  completeToolCall,
} from "@wattson/memory";

export interface SkillRegistry {
  getSkill: (name: string) => SkillLike | undefined;
  listSkills: () => SkillLike[];
}

export interface ExecutorResult {
  toolResultContext: string;
  cancelled: boolean;
  /** User-facing message to show when `cancelled` is true. Falls back to a generic message if absent. */
  cancelledMessage?: string;
  /** Raw skill output — used by agent.ts to update session context (e.g. social metrics). */
  rawSkillResult?: unknown;
  /** Name of the skill that ran, paired with rawSkillResult. */
  executedSkillName?: string;
}

function ts(): string {
  return new Date().toISOString();
}

export async function executePlan(
  plan: AgentPlan,
  input: AgentInput,
  emit: EventEmitter,
  registry: SkillRegistry
): Promise<ExecutorResult> {
  const empty: ExecutorResult = { toolResultContext: "", cancelled: false };

  if (!plan.skillName) return empty;

  const skill = registry.getSkill(plan.skillName);
  if (!skill) {
    console.warn(`[executor] skill not found: ${plan.skillName}`);
    return empty;
  }

  if (!checkPermissions(skill, { source: input.source })) {
    const msg = `Sin permisos para ejecutar la skill "${skill.name}".`;
    emit({ type: "error", error: msg, timestamp: ts() });
    return { toolResultContext: `\nError: ${msg}`, cancelled: true };
  }

  emit({ type: "status", status: "planning", timestamp: ts() });

  const toolCallId = randomUUID();

  if (plan.requiresApproval) {
    const timeout = parseInt(process.env.APPROVAL_TIMEOUT_MS ?? "300000", 10);
    const expiresAt = new Date(Date.now() + timeout).toISOString();

    const approvalRecord = await createApproval({
      toolName: skill.name,
      summary: plan.description,
      args: { message: input.userMessage },
      riskLevel: skill.riskLevel,
    });

    console.log(`[executor] approval requested for ${skill.name} (${approvalRecord.id})`);

    emit({
      type: "approval_requested",
      approvalId: approvalRecord.id,
      toolName: skill.name,
      summary: plan.description,
      args: { message: input.userMessage },
      timestamp: ts(),
    });
    emit({ type: "status", status: "waiting_approval", timestamp: ts() });

    const decision = await approvalManager.waitForDecision({
      id: approvalRecord.id,
      toolName: skill.name,
      summary: plan.description,
      riskLevel: skill.riskLevel as "low" | "medium" | "high",
      args: { message: input.userMessage },
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    await resolveApproval(approvalRecord.id, decision.approved);
    emit({
      type: "approval_resolved",
      approvalId: approvalRecord.id,
      approved: decision.approved,
      timestamp: ts(),
    });

    console.log(`[executor] approval ${decision.approved ? "granted" : "rejected"} for ${skill.name}`);

    if (!decision.approved) {
      return { toolResultContext: "", cancelled: true };
    }
  }

  // Dynamic (skill-driven) approval: the skill evaluates its own policy and
  // decides — after seeing the actual request — whether this specific call
  // needs human approval. Used by composio_tool_gateway for write/send/delete
  // actions; skills without `preflight` are unaffected.
  let executeArgs: { message: string } = { message: input.userMessage };

  if (skill.preflight) {
    const preflight = await skill.preflight(executeArgs, { conversationId: input.conversationId, emit });

    if (preflight.status === "requires_approval") {
      const { approvalRequest, pendingExecution } = preflight;

      const approvalRecord = await createApproval({
        toolName: approvalRequest.toolName,
        summary: approvalRequest.description ?? approvalRequest.summary,
        args: approvalRequest.paramsPreview ?? approvalRequest.args,
        riskLevel: approvalRequest.riskLevel,
      });

      const approvalId = approvalRecord.id;
      const finalApprovalRequest: ApprovalRequest = { ...approvalRequest, id: approvalId };
      createPendingApproval(finalApprovalRequest, pendingExecution);

      console.log(`[executor] dynamic approval requested for ${skill.name} (${approvalId})`);

      emit({
        type: "approval_requested",
        approvalId,
        toolName: finalApprovalRequest.toolName,
        summary: finalApprovalRequest.description ?? finalApprovalRequest.summary,
        args: finalApprovalRequest.paramsPreview ?? finalApprovalRequest.args,
        risk: finalApprovalRequest.risk,
        toolkit: finalApprovalRequest.toolkit,
        action: finalApprovalRequest.action,
        skillName: finalApprovalRequest.skillName,
        timestamp: ts(),
      });
      emit({ type: "status", status: "waiting_approval", timestamp: ts() });

      const decision = await approvalManager.waitForDecision({
        id: approvalId,
        toolName: finalApprovalRequest.toolName,
        summary: finalApprovalRequest.description ?? finalApprovalRequest.summary,
        riskLevel: finalApprovalRequest.riskLevel,
        args: finalApprovalRequest.paramsPreview ?? finalApprovalRequest.args,
        createdAt: finalApprovalRequest.createdAt,
        expiresAt: finalApprovalRequest.expiresAt,
      });

      await resolveApproval(approvalId, decision.approved);
      resolvePendingApproval(approvalId, decision.approved);

      emit({ type: "approval_resolved", approvalId, approved: decision.approved, timestamp: ts() });

      console.log(`[executor] dynamic approval ${decision.approved ? "granted" : "rejected"} for ${skill.name}`);

      if (!decision.approved) {
        return {
          toolResultContext: "",
          cancelled: true,
          cancelledMessage: "Listo, cancelé la acción. No se modificó nada.",
        };
      }

      executeArgs = pendingExecution.input as { message: string };
    }
    // status === "proceed" falls through to the normal execute() flow below,
    // using the original args — this also covers requests the skill blocks
    // internally (e.g. read-only mode), which `execute()` reports without
    // calling any external adapter.
  }

  emit({ type: "status", status: "executing_tool", timestamp: ts() });
  emit({
    type: "tool_call_started",
    toolCallId,
    toolName: skill.name,
    args: executeArgs,
    timestamp: ts(),
  });

  const dbCall = await logToolCall({
    conversationId: input.conversationId,
    toolName: skill.name,
    args: executeArgs,
    riskLevel: skill.riskLevel,
    status: "running",
  });

  try {
    const socialContext = input.conversationId
      ? getSocialContext(input.conversationId)
      : undefined;

    const result = await skill.execute(
      executeArgs,
      { conversationId: input.conversationId, emit, socialContext }
    );
    await completeToolCall(dbCall.id, result, "completed");

    emit({
      type: "tool_call_completed",
      toolCallId,
      toolName: skill.name,
      result,
      timestamp: ts(),
    });

    console.log(`[executor] ${skill.name} completed`);
    return {
      toolResultContext: `\n\nResultado de ${skill.name}:\n${JSON.stringify(result, null, 2)}`,
      cancelled: false,
      rawSkillResult: result,
      executedSkillName: skill.name,
    };
  } catch (err) {
    const errMsg = String(err);
    await completeToolCall(dbCall.id, { error: errMsg }, "failed");

    emit({
      type: "tool_call_completed",
      toolCallId,
      toolName: skill.name,
      result: { error: errMsg },
      timestamp: ts(),
    });
    emit({ type: "error", error: `Skill ${skill.name} falló: ${errMsg}`, timestamp: ts() });

    console.error(`[executor] ${skill.name} failed:`, errMsg);
    return { toolResultContext: `\n\nError en ${skill.name}: ${errMsg}`, cancelled: false };
  }
}
