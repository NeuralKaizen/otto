import { motion } from "framer-motion";
import type { AgentStatus } from "@jarvis/shared";

interface Props {
  status: AgentStatus;
  connected: boolean;
}

const DOT_COLORS: Partial<Record<AgentStatus, string>> = {
  thinking: "bg-cyan-400",
  planning: "bg-blue-400",
  executing_tool: "bg-yellow-400",
  waiting_approval: "bg-orange-400",
  responding: "bg-green-400",
  error: "bg-red-400",
};

export function StatusPill({ status, connected }: Props) {
  const dotClass = DOT_COLORS[status] ?? "bg-jarvis-muted";
  const pulse = status !== "idle" && status !== "done" && status !== "error";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full jarvis-card text-xs">
      <span
        className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-jarvis-cyan" : "bg-red-500"}`}
      />
      <span className="text-jarvis-subtle">API</span>
      <span className="text-jarvis-border">|</span>
      <motion.span
        className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
        animate={pulse ? { scale: [1, 1.4, 1] } : {}}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <span className="text-jarvis-text uppercase tracking-widest">{status.replace("_", " ")}</span>
    </div>
  );
}
