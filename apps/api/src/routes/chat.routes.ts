import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSessionContextSnapshot, runAgent } from "@jarvis/agent-core";
import { createConversation } from "@jarvis/memory";
import { broadcast } from "../ws/eventBus.js";

const chatBodySchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
  source: z.enum(["web", "voice", "cli"]).default("web"),
});

const sessionContextQuerySchema = z.object({
  conversationId: z.string().min(1),
});

interface ChatRouteDeps {
  createConversationId?: () => Promise<string>;
  runAgent?: typeof runAgent;
  broadcast?: typeof broadcast;
  getSessionContextSnapshot?: typeof getSessionContextSnapshot;
}

export function chatRoutes(app: FastifyInstance, deps: ChatRouteDeps = {}): void {
  const createConversationId =
    deps.createConversationId ??
    (async () => {
      const conversation = await createConversation();
      return conversation.id;
    });
  const runAgentFn = deps.runAgent ?? runAgent;
  const broadcastFn = deps.broadcast ?? broadcast;
  const getSessionContextSnapshotFn = deps.getSessionContextSnapshot ?? getSessionContextSnapshot;

  app.get("/chat/session-context", async (req, reply) => {
    const parsed = sessionContextQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }

    reply.send({
      ok: true,
      data: getSessionContextSnapshotFn(parsed.data.conversationId),
    });
  });

  app.post("/chat", async (req, reply) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }

    const { conversationId, message, source } = parsed.data;
    const resolvedConversationId = conversationId ?? (await createConversationId());
    const runId = randomUUID();

    app.log.info(
      { runId, conversationId: resolvedConversationId, source, message: message.slice(0, 120) },
      "chat run started"
    );

    void runAgentFn(
      { conversationId: resolvedConversationId, userMessage: message, source },
      (event) => broadcastFn(event)
    )
      .then((result) => {
        app.log.info(
          { runId, conversationId: result.conversationId, chars: result.finalContent.length },
          "chat run completed"
        );
      })
      .catch((err: unknown) => {
        app.log.error({ runId, err }, "chat run error");
        broadcastFn({ type: "error", error: String(err), timestamp: new Date().toISOString() });
      });

    reply.send({ ok: true, data: { runId, conversationId: resolvedConversationId } });
  });
}
