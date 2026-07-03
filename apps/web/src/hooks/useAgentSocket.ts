import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentEvent, AgentStatus } from "@jarvis/shared";
import type { DisplayMessage, DisplayToolCall, DisplayApproval } from "../lib/types.js";
import { sendChat } from "../lib/api.js";
import { randomId } from "../lib/utils.js";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws";

export function useAgentSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingRef = useRef<Map<string, string>>(new Map());
  const currentStreamingMessageId = useRef<string | null>(null);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<DisplayToolCall[]>([]);
  const [approvals, setApprovals] = useState<DisplayApproval[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);

  const handleEvent = useCallback((event: AgentEvent) => {
    const now = new Date().toISOString();

    switch (event.type) {
      case "status":
        setStatus(event.status);
        break;

      case "intent_detected":
        // Consumed — intent info is reflected in status transitions
        break;

      case "plan_created":
        // Consumed — plan info visible through tool events in ActionTimeline
        break;

      case "message_started": {
        currentStreamingMessageId.current = event.messageId;
        setIsStreaming(true);
        setMessages((prev) => {
          const exists = prev.find((m) => m.id === event.messageId);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: event.messageId,
              role: "assistant",
              content: "",
              streaming: true,
              provider: event.provider,
              model: event.model,
              timestamp: now,
            },
          ];
        });
        break;
      }

      case "message_delta": {
        const current = streamingRef.current.get(event.messageId) ?? "";
        const updated = current + event.delta;
        streamingRef.current.set(event.messageId, updated);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === event.messageId);
          if (idx === -1) {
            return [
              ...prev,
              { id: event.messageId, role: "assistant", content: updated, streaming: true, timestamp: now },
            ];
          }
          const next = [...prev];
          next[idx] = { ...next[idx], content: updated, streaming: true };
          return next;
        });
        break;
      }

      case "message_done":
        streamingRef.current.delete(event.messageId);
        if (currentStreamingMessageId.current === event.messageId) {
          currentStreamingMessageId.current = null;
          setIsStreaming(false);
        }
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === event.messageId);
          if (idx === -1) {
            return [
              ...prev,
              {
                id: event.messageId,
                role: "assistant",
                content: event.content,
                streaming: false,
                cancelled: event.cancelled,
                provider: event.provider,
                model: event.model,
                timestamp: now,
              },
            ];
          }
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            content: event.content,
            streaming: false,
            cancelled: event.cancelled,
            provider: event.provider ?? next[idx].provider,
            model: event.model ?? next[idx].model,
          };
          return next;
        });
        break;

      case "tool_call_started":
        setToolCalls((prev) => [
          ...prev,
          { id: event.toolCallId, toolName: event.toolName, args: event.args, status: "running", startedAt: now },
        ]);
        break;

      case "tool_call_completed":
        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.id === event.toolCallId
              ? { ...tc, result: event.result, status: "completed", completedAt: now }
              : tc
          )
        );
        break;

      case "approval_requested":
        setApprovals((prev) => [
          ...prev,
          {
            id: event.approvalId,
            toolName: event.toolName,
            summary: event.summary,
            args: event.args,
            status: "pending",
            createdAt: now,
            risk: event.risk,
            toolkit: event.toolkit,
            action: event.action,
          },
        ]);
        break;

      case "approval_resolved":
        setApprovals((prev) =>
          prev.map((a) =>
            a.id === event.approvalId ? { ...a, status: event.approved ? "approved" : "rejected" } : a
          )
        );
        break;

      case "error":
        setStatus("error");
        setIsStreaming(false);
        currentStreamingMessageId.current = null;
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      setStatus("idle");
      setIsStreaming(false);
      currentStreamingMessageId.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    socket.onerror = () => socket.close();
    socket.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as AgentEvent;
        handleEvent(event);
      } catch {
        // ignore malformed events
      }
    };
  }, [handleEvent]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsgId = randomId();
      const now = new Date().toISOString();
      setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: text, timestamp: now }]);
      setStatus("thinking");

      const res = await sendChat(text, conversationId);
      if (res?.data?.conversationId) {
        setConversationId(res.data.conversationId);
      }
    },
    [conversationId]
  );

  const sendApprovalDecision = useCallback((approvalId: string, approved: boolean) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "approval_decision", approvalId, approved }));
    }
  }, []);

  const cancelGeneration = useCallback(() => {
    const msgId = currentStreamingMessageId.current;
    if (msgId && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "cancel_generation", messageId: msgId }));
    }
  }, []);

  return {
    connected,
    status,
    messages,
    toolCalls,
    approvals,
    isStreaming,
    sendMessage,
    sendApprovalDecision,
    cancelGeneration,
    conversationId,
  };
}
