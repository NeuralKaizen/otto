/**
 * Phase 11 — Composio from Chat: unit tests for skill policy + parser.
 *
 * Uses Node's built-in test runner (same pattern as router.test.ts).
 * Does NOT start a server or make real network calls.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseComposioQuery } from "./composioParser.js";
import { evaluatePolicy } from "./composioPolicy.js";
import { getComposioConfig } from "./composioConfig.js";
import { composioSkill } from "./composioSkill.js";

// ---------------------------------------------------------------------------
// Helper: build a minimal config override without touching process.env globally
// ---------------------------------------------------------------------------
function cfgWith(overrides: Record<string, string | boolean | string[]>) {
  // Save and restore env vars around each override block.
  const saved: Record<string, string | undefined> = {};
  const MAP: Record<string, string> = {
    readOnly: "COMPOSIO_READ_ONLY_MODE",
    requireApprovalForWrite: "COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE",
    enabled: "ENABLE_COMPOSIO",
    apiKey: "COMPOSIO_API_KEY",
    userId: "COMPOSIO_USER_ID",
  };
  for (const [k, v] of Object.entries(overrides)) {
    const envKey = MAP[k] ?? k;
    saved[envKey] = process.env[envKey];
    process.env[envKey] = Array.isArray(v) ? v.join(",") : String(v);
  }
  const cfg = getComposioConfig();
  for (const [envKey, original] of Object.entries(saved)) {
    if (original === undefined) delete process.env[envKey];
    else process.env[envKey] = original;
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Test A — Gmail read prompt: parser detects gmail + read, no approval needed
// ---------------------------------------------------------------------------
test("Fase 11 A: Gmail read → parser detecta toolkit gmail + risk read", () => {
  const parsed = parseComposioQuery("Busca mis últimos correos de Gmail sobre facturas");
  assert.ok(parsed, "parser should return a result");
  assert.equal(parsed.toolkit, "gmail");
  assert.equal(parsed.confidence > 0.5, true);

  const cfg = cfgWith({ readOnly: true });
  const decision = evaluatePolicy(parsed.toolkit, parsed.action, cfg);
  assert.equal(decision.allowed, true, "read action should be allowed even in read-only mode");
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.risk, "read");
});

// ---------------------------------------------------------------------------
// Test B — Gmail draft with READ_ONLY=false + REQUIRE_APPROVAL=true
// ---------------------------------------------------------------------------
test("Fase 11 B: Gmail draft → requiresApproval cuando READ_ONLY=false", async () => {
  const result = await composioSkill.execute(
    { message: "Crea un draft en Gmail para Juan diciendo que mañana le confirmo" },
    {}
  );
  // By default COMPOSIO_READ_ONLY_MODE=true, so the action is blocked.
  // Test B verifies the skill WOULD flag requiresApproval under the non-read-only policy:
  const parsed = parseComposioQuery("Crea un draft en Gmail para Juan diciendo que mañana le confirmo");
  assert.ok(parsed, "parser should detect gmail write");
  assert.equal(parsed.toolkit, "gmail");
  assert.notEqual(parsed.confidence, 0);

  // Check policy with READ_ONLY=false + requireApproval=true
  const cfg = cfgWith({ readOnly: false, requireApprovalForWrite: true });
  const decision = evaluatePolicy(parsed.toolkit, parsed.action, cfg);
  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresApproval, true, "Gmail send should require approval");
});

// ---------------------------------------------------------------------------
// Test C — Gmail draft with READ_ONLY=true → blocked
// ---------------------------------------------------------------------------
test("Fase 11 C: Gmail draft en READ_ONLY mode → blocked:true, sin approval", async () => {
  // READ_ONLY_MODE is true in the default .env
  const result = await composioSkill.execute(
    { message: "Crea un draft en Gmail para Juan" },
    {}
  );
  // Parser detects gmail write; policy blocks because readOnly=true
  assert.equal(result.blocked, true, "write action should be blocked in read-only mode");
  assert.equal(result.requiresApproval, false);
  assert.match(result.summary, /solo lectura|read.only/i);
});

// ---------------------------------------------------------------------------
// Test D — Calendar read prompt
// ---------------------------------------------------------------------------
test("Fase 11 D: Calendar read → parser detecta googlecalendar + risk read", () => {
  const parsed = parseComposioQuery("Qué tengo mañana en mi calendario de Google");
  assert.ok(parsed, "parser should return a result");
  assert.equal(parsed.toolkit, "googlecalendar");

  const cfg = cfgWith({ readOnly: true });
  const decision = evaluatePolicy(parsed.toolkit, parsed.action, cfg);
  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresApproval, false);
});

// ---------------------------------------------------------------------------
// Test E — Notion write → write action detected
// ---------------------------------------------------------------------------
test("Fase 11 E: Notion write → parser detecta notion + risk write", () => {
  const parsed = parseComposioQuery("Crea una página en Notion con el resumen de esta conversación");
  assert.ok(parsed, "parser should return a result for notion write");
  assert.equal(parsed.toolkit, "notion");

  const cfg = cfgWith({ readOnly: true });
  const decision = evaluatePolicy(parsed.toolkit, parsed.action, cfg);
  // Blocked because readOnly=true and risk is write
  assert.equal(decision.allowed, false);
  assert.match(decision.blockedReason ?? "", /solo lectura|read.only/i);
});

// ---------------------------------------------------------------------------
// Test F — Approval execution: once approved (approved=true), skill executes once
// ---------------------------------------------------------------------------
test("Fase 11 F: execute con approved=true no pide aprobación de nuevo", async () => {
  const result = await composioSkill.execute(
    { message: "Crea una tarea en Notion para revisar el CRM", approved: true },
    {}
  );
  // With READ_ONLY=true, the policy still blocks — approved flag only matters
  // when policy says allowed+requiresApproval. Here it's blocked, so we get blocked.
  // This verifies there's no infinite approval loop: the skill doesn't re-request approval.
  assert.equal(result.requiresApproval, false, "approved flag should not trigger another approval request");
});

// ---------------------------------------------------------------------------
// Test F2 — With READ_ONLY=false, approved=true bypasses the approval gate
// ---------------------------------------------------------------------------
test("Fase 11 F2: execute con approved=true y READ_ONLY=false ejecuta la acción (mock)", async () => {
  const saved = process.env.COMPOSIO_READ_ONLY_MODE;
  const savedReq = process.env.COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE;
  process.env.COMPOSIO_READ_ONLY_MODE = "false";
  process.env.COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE = "true";

  try {
    const result = await composioSkill.execute(
      { message: "Crea una tarea en Notion para revisar el CRM", approved: true },
      {}
    );
    assert.equal(result.blocked, false, "approved action should not be blocked");
    assert.equal(result.requiresApproval, false, "approved action should not require approval again");
    assert.ok(result.summary.length > 0, "should return a non-empty summary");
  } finally {
    if (saved === undefined) delete process.env.COMPOSIO_READ_ONLY_MODE;
    else process.env.COMPOSIO_READ_ONLY_MODE = saved;
    if (savedReq === undefined) delete process.env.COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE;
    else process.env.COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE = savedReq;
  }
});

// ---------------------------------------------------------------------------
// Test G — Rejection / blocked: response is clear, nothing executed
// ---------------------------------------------------------------------------
test("Fase 11 G: rechazado/bloqueado → summary claro, blocked=true o cancelled-by-policy", async () => {
  // READ_ONLY=true: write is blocked (never queued for approval)
  const result = await composioSkill.execute(
    { message: "Crea un evento en Google Calendar mañana" },
    {}
  );
  // Calendar write is blocked in read-only mode
  assert.equal(result.blocked, true);
  assert.ok(result.summary.length > 0, "should have a human-readable blocked message");
  assert.equal(result.source, "none", "source should be none when blocked");
});

// ---------------------------------------------------------------------------
// Test H — Skill executes a read without throwing (streaming compatibility)
// ---------------------------------------------------------------------------
test("Fase 11 H: skill ejecuta lectura sin lanzar excepción (streaming compatible)", async () => {
  const result = await composioSkill.execute(
    { message: "Busca tareas pendientes en Notion" },
    {}
  );
  assert.ok(result, "skill should return a result");
  assert.ok(typeof result.summary === "string", "summary should be a string");
  assert.ok(Array.isArray(result.insights), "insights should be an array");
  assert.ok(Array.isArray(result.limitations), "limitations should be an array");
  assert.ok(result.source === "mock" || result.source === "composio_api" || result.source === "none");
});
