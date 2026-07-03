import type { FastifyInstance } from "fastify";
import { addClient } from "./eventBus.js";
import { approvalManager, cancelMessage } from "@wattson/agent-core";

export function registerWebSocket(app: FastifyInstance): void {
  app.get("/ws", { websocket: true }, (conn) => {
    addClient(conn);
    app.log.info("WebSocket client connected");

    conn.socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          approvalId?: string;
          approved?: boolean;
          reason?: string;
          messageId?: string;
          payload?: { approvalId?: string; approved?: boolean; reason?: string };
        };

        // Accept both the existing flat shape ({type, approvalId, approved}) and
        // the {type:"approval_response", payload:{approvalId, approved}} shape —
        // both resolve the same approvalManager entry (static or dynamic).
        if ((msg.type === "approval_decision" || msg.type === "approval_response")) {
          const approvalId = msg.approvalId ?? msg.payload?.approvalId;
          const approved = msg.approved ?? msg.payload?.approved ?? false;
          const reason = msg.reason ?? msg.payload?.reason;

          if (approvalId == null) {
            conn.socket.send(
              JSON.stringify({
                type: "error",
                error: "approval response missing approvalId",
                timestamp: new Date().toISOString(),
              })
            );
          } else if (!approvalManager.hasPending(approvalId)) {
            conn.socket.send(
              JSON.stringify({
                type: "error",
                error: `No pending approval found for id ${approvalId}`,
                timestamp: new Date().toISOString(),
              })
            );
          } else {
            // executor.ts handles DB update and approval_resolved event after the promise resolves
            approvalManager.resolve({ approvalId, approved, reason });
            app.log.info({ approvalId, approved }, "approval decision received");
          }
        }

        if (msg.type === "cancel_generation" && msg.messageId) {
          cancelMessage(msg.messageId);
          app.log.info({ messageId: msg.messageId }, "cancel_generation received");
        }
      } catch {
        // ignore malformed messages
      }
    });

    conn.socket.on("close", () => {
      app.log.info("WebSocket client disconnected");
    });
  });
}
