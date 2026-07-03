import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { chatRoutes } from "./chat.routes.js";

test("POST /chat crea un conversationId real en el primer turno y se lo pasa al agente", async () => {
  let receivedConversationId: string | undefined;

  const app = Fastify();
  chatRoutes(app, {
    createConversationId: async () => "conv-created-on-api",
    runAgent: async (input) => {
      receivedConversationId = input.conversationId;
      return {
        conversationId: input.conversationId ?? "missing",
        assistantMessageId: "assistant-1",
        finalContent: "ok",
      };
    },
    broadcast: () => undefined,
    getSessionContextSnapshot: (conversationId) => ({
      conversationId,
      hasSocialContext: false,
    }),
  });

  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: { message: "dame las metricas de @lucianomusellaa en instagram", source: "web" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(receivedConversationId, "conv-created-on-api");

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.conversationId, "conv-created-on-api");

  await app.close();
});

test("POST /chat reutiliza el conversationId existente y no crea otro", async () => {
  let createCalls = 0;
  let receivedConversationId: string | undefined;

  const app = Fastify();
  chatRoutes(app, {
    createConversationId: async () => {
      createCalls += 1;
      return "conv-should-not-be-used";
    },
    runAgent: async (input) => {
      receivedConversationId = input.conversationId;
      return {
        conversationId: input.conversationId ?? "missing",
        assistantMessageId: "assistant-2",
        finalContent: "ok",
      };
    },
    broadcast: () => undefined,
    getSessionContextSnapshot: (conversationId) => ({
      conversationId,
      hasSocialContext: false,
    }),
  });

  await app.ready();

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: { conversationId: "conv-existing", message: "videos mas vistos de esa cuenta", source: "web" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(receivedConversationId, "conv-existing");
  assert.equal(createCalls, 0);

  const body = response.json();
  assert.equal(body.data.conversationId, "conv-existing");

  await app.close();
});

test("GET /chat/session-context devuelve un resumen sanitizado del contexto", async () => {
  const app = Fastify();
  chatRoutes(app, {
    createConversationId: async () => "conv-test",
    runAgent: async (input) => ({
      conversationId: input.conversationId ?? "missing",
      assistantMessageId: "assistant-3",
      finalContent: "ok",
    }),
    broadcast: () => undefined,
    getSessionContextSnapshot: () => ({
      conversationId: "conv-existing",
      hasSocialContext: true,
      lastUsername: "lucianomusellaa",
      lastPlatform: "instagram",
      lastToolName: "social_metrics_lookup",
      dataSource: "zernio",
      updatedAt: "2026-06-17T00:00:00.000Z",
    }),
  });

  await app.ready();

  const response = await app.inject({
    method: "GET",
    url: "/chat/session-context?conversationId=conv-existing",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.deepEqual(body.data, {
    conversationId: "conv-existing",
    hasSocialContext: true,
    lastUsername: "lucianomusellaa",
    lastPlatform: "instagram",
    lastToolName: "social_metrics_lookup",
    dataSource: "zernio",
    updatedAt: "2026-06-17T00:00:00.000Z",
  });
  assert.equal("topPosts" in body.data, false);
  assert.equal("recentContent" in body.data, false);

  await app.close();
});
