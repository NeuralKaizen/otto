import type { AgentEvent } from "@wattson/shared";
import type { RenderedWidget } from "../voice/types";
import { widgetsFromToolResult } from "./metricsWidgets";

const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_WS_URL = "ws://localhost:4000/ws";
const DEFAULT_TIMEOUT_MS = 30000;
const RECONNECT_MS = 1500;

export const APPROVAL_DECLINE_NARRATION =
  "Todavía no puedo ejecutar acciones que requieren aprobación; eso llega en la próxima versión.";

export interface ConverseResult {
  narration: string;
  widgets: RenderedWidget[];
}

export interface AgentClient {
  converse(text: string): Promise<ConverseResult>;
  dispose(): void;
}

export interface AgentClientOptions {
  apiUrl?: string;
  wsUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  createWebSocket?: (url: string) => WebSocket;
}

interface PendingRun {
  messageId: string | null;
  resolve: (r: ConverseResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  // Widgets extraídos de los tool_call_completed de ESTE run; se entregan
  // en message_done y mueren con el run (nunca cruzan a un turno siguiente).
  widgets: RenderedWidget[];
  // Resolves once the initiating POST /chat response has been fully
  // processed (including capturing a returned conversationId). Successful
  // completion (message_done) is gated on this so a fast WS event can never
  // resolve converse() before conversationId has been learned.
  ready: Promise<void>;
}

export function createAgentClient(options: AgentClientOptions = {}): AgentClient {
  const apiUrl = options.apiUrl ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
  const wsUrl = options.wsUrl ?? import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const makeWs = options.createWebSocket ?? ((url: string) => new WebSocket(url));

  let ws: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let conversationId: string | undefined;
  let pending: PendingRun | null = null;

  function connect(): void {
    if (disposed) return;
    ws = makeWs(wsUrl);
    ws.onmessage = (ev: MessageEvent) => handleEvent(ev);
    ws.onclose = () => {
      ws = null;
      if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_MS);
    };
  }

  function settleResolve(r: ConverseResult): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(r);
  }

  function settleReject(err: Error): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { reject } = pending;
    pending = null;
    reject(err);
  }

  function sendJson(msg: unknown): void {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function handleEvent(ev: MessageEvent): void {
    if (!pending) return;
    let e: AgentEvent;
    try {
      e = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)) as AgentEvent;
    } catch {
      return;
    }
    switch (e.type) {
      case "message_started":
        if (pending.messageId === null) pending.messageId = e.messageId;
        break;
      case "message_done":
        if (e.messageId === pending.messageId) {
          const run = pending;
          const content = e.content;
          // Wait for the POST response's conversationId capture to finish
          // before settling, so callers that immediately reuse the client
          // always see the learned conversationId.
          run.ready.then(() => {
            if (pending !== run) return;
            if (content && content.trim()) settleResolve({ narration: content, widgets: run.widgets });
            else settleReject(new Error("empty response"));
          });
        }
        break;
      case "tool_call_completed":
        pending.widgets.push(...widgetsFromToolResult(e.toolName, e.result));
        break;
      case "approval_requested": {
        const run = pending;
        sendJson({ type: "approval_decision", approvalId: e.approvalId, approved: false, reason: "approvals not wired in HUD yet" });
        run.ready.then(() => {
          if (pending !== run) return;
          settleResolve({ narration: APPROVAL_DECLINE_NARRATION, widgets: [] });
        });
        break;
      }
      case "error": {
        const run = pending;
        const message = e.error;
        run.ready.then(() => {
          if (pending !== run) return;
          settleReject(new Error(message));
        });
        break;
      }
      default:
        break;
    }
  }

  function converse(text: string): Promise<ConverseResult> {
    return new Promise<ConverseResult>((resolve, reject) => {
      if (pending) {
        reject(new Error("converse already in progress"));
        return;
      }
      const timer = setTimeout(() => settleReject(new Error("response timeout")), timeoutMs);
      const run: PendingRun = { messageId: null, resolve, reject, timer, widgets: [], ready: Promise.resolve() };
      pending = run;

      run.ready = fetchImpl(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, source: "voice", conversationId }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`chat failed: ${r.status}`);
          return r.json() as Promise<{ ok: boolean; data?: { conversationId?: string; runId?: string } }>;
        })
        .then((body) => {
          if (body?.data?.conversationId) conversationId = body.data.conversationId;
        })
        .catch((err: unknown) => settleReject(err instanceof Error ? err : new Error(String(err))));
    });
  }

  function dispose(): void {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    settleReject(new Error("client disposed"));
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  connect();
  return { converse, dispose };
}
