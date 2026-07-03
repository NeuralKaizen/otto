import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getSocialContext,
  getSessionContextSnapshot,
  setSocialContext,
  clearSessionContext,
  _resetRegistryForTests,
} from "./sessionContextRegistry.js";

const MOCK_CTX = {
  platform: "instagram",
  username: "lucianomusellaa",
  summary: "2.5M seguidores, engagement rate 3.2%",
  dataSource: "mock" as const,
  lastToolName: "social_metrics_lookup",
  topPosts: [],
  recentContent: [],
  warnings: [],
  timestamp: "2026-06-17T00:00:00.000Z",
};

beforeEach(() => {
  _resetRegistryForTests();
});

test("Caso A: getSocialContext devuelve undefined para conversación desconocida", () => {
  const result = getSocialContext("nonexistent-conv-id");
  assert.equal(result, undefined);
});

test("Caso B: setSocialContext + getSocialContext round-trip", () => {
  setSocialContext("conv-1", MOCK_CTX);
  const result = getSocialContext("conv-1");
  assert.ok(result, "debe devolver el contexto guardado");
  assert.equal(result.username, "lucianomusellaa");
  assert.equal(result.platform, "instagram");
  assert.equal(result.summary, MOCK_CTX.summary);
  assert.equal(result.dataSource, "mock");
});

test("Caso C: clearSessionContext elimina el contexto", () => {
  setSocialContext("conv-2", MOCK_CTX);
  clearSessionContext("conv-2");
  const result = getSocialContext("conv-2");
  assert.equal(result, undefined);
});

test("Caso D: contextos de distintas conversaciones son independientes", () => {
  setSocialContext("conv-a", { ...MOCK_CTX, username: "userA" });
  setSocialContext("conv-b", { ...MOCK_CTX, username: "userB", platform: "tiktok" });

  assert.equal(getSocialContext("conv-a")?.username, "userA");
  assert.equal(getSocialContext("conv-b")?.username, "userB");
  assert.equal(getSocialContext("conv-b")?.platform, "tiktok");
});

test("Caso E: setSocialContext sobreescribe el contexto anterior para la misma conversación", () => {
  setSocialContext("conv-3", MOCK_CTX);
  setSocialContext("conv-3", { ...MOCK_CTX, username: "nuevo-usuario", platform: "youtube" });

  const result = getSocialContext("conv-3");
  assert.equal(result?.username, "nuevo-usuario");
  assert.equal(result?.platform, "youtube");
});

test("Caso F: conserva platform, username y dataSource para follow-ups sociales", () => {
  setSocialContext("conv-zernio", {
    ...MOCK_CTX,
    platform: "instagram",
    username: "lucianomusellaa",
    dataSource: "zernio",
    warnings: ["Fuente: Zernio"],
  });

  const result = getSocialContext("conv-zernio");
  assert.equal(result?.platform, "instagram");
  assert.equal(result?.username, "lucianomusellaa");
  assert.equal(result?.dataSource, "zernio");
  assert.deepEqual(result?.warnings, ["Fuente: Zernio"]);
});

test("Caso G: getSessionContextSnapshot devuelve un resumen sanitizado", () => {
  setSocialContext("conv-debug", {
    ...MOCK_CTX,
    username: "lucianomusellaa",
    platform: "instagram",
    dataSource: "zernio",
  });

  const snapshot = getSessionContextSnapshot("conv-debug");
  assert.deepEqual(snapshot, {
    conversationId: "conv-debug",
    hasSocialContext: true,
    lastUsername: "lucianomusellaa",
    lastPlatform: "instagram",
    lastToolName: "social_metrics_lookup",
    dataSource: "zernio",
    updatedAt: "2026-06-17T00:00:00.000Z",
  });
});
