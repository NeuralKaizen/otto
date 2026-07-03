import { motion } from "framer-motion";
import type { DisplayMessage } from "../../lib/types.js";
import { formatTime } from "../../lib/utils.js";

interface Props {
  message: DisplayMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-wattson-blue bg-opacity-30 border border-wattson-blue text-wattson-text"
              : message.cancelled
              ? "wattson-card text-wattson-muted border border-orange-900 border-opacity-40"
              : "wattson-card text-wattson-text"
          }`}
        >
          {message.cancelled ? (
            <span className="italic text-wattson-muted">
              {message.content || "Generación cancelada."}
            </span>
          ) : (
            message.content
          )}
          {message.streaming && !message.cancelled && (
            <motion.span
              className="inline-block w-1.5 h-4 ml-0.5 bg-wattson-cyan align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          )}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-wattson-muted">{formatTime(message.timestamp)}</span>
          {!isUser && message.provider && (
            <span className="text-[9px] text-wattson-border tracking-widest uppercase">
              {message.provider === "mock" ? "MOCK" : message.model ?? message.provider.toUpperCase()}
            </span>
          )}
          {message.cancelled && (
            <span className="text-[9px] text-orange-500 tracking-widest uppercase">CANCELADO</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
