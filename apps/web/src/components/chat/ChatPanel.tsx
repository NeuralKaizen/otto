import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DisplayMessage, AgentStatus } from "../../lib/types.js";
import { MessageBubble } from "./MessageBubble.js";
import { ChatInput } from "./ChatInput.js";

interface Props {
  messages: DisplayMessage[];
  status: AgentStatus;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

const STATUS_LABEL: Partial<Record<AgentStatus, string>> = {
  thinking: "Jarvis está pensando...",
  planning: "Planificando acción...",
  executing_tool: "Ejecutando herramienta...",
  waiting_approval: "Esperando aprobación...",
  responding: "Jarvis está escribiendo...",
};

export function ChatPanel({ messages, status, isStreaming, onSend, onCancel }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isProcessing =
    status === "thinking" ||
    status === "planning" ||
    status === "executing_tool" ||
    status === "waiting_approval" ||
    status === "responding";

  const statusLabel = STATUS_LABEL[status];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-jarvis-muted text-sm">Ready for your command</div>
            <div className="text-jarvis-border text-xs">
              Try: "Genera un post de LinkedIn sobre automatización" · "Recuerda que mi proyecto se llama Jarvis OS"
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <AnimatePresence>
          {isProcessing && statusLabel && (
            <motion.div
              key="typing-indicator"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex justify-start mb-3"
            >
              <div className="jarvis-card rounded-lg px-3 py-2 text-xs text-jarvis-muted flex items-center gap-2">
                <motion.span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-jarvis-cyan"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                {statusLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-jarvis-border">
        <ChatInput
          onSend={onSend}
          onCancel={onCancel}
          disabled={isProcessing && !isStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
