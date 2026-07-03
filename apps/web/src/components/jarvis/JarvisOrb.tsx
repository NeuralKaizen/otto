import { motion } from "framer-motion";
import type { AgentStatus } from "@jarvis/shared";

interface Props {
  status: AgentStatus;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "Idle",
  listening: "Listening",
  transcribing: "Transcribing",
  thinking: "Thinking",
  planning: "Planning",
  executing_tool: "Executing",
  waiting_approval: "Awaiting Approval",
  responding: "Responding",
  done: "Done",
  error: "Error",
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#1a3a5c",
  listening: "#00d4ff",
  transcribing: "#0088ff",
  thinking: "#00d4ff",
  planning: "#0088ff",
  executing_tool: "#ffaa00",
  waiting_approval: "#ff6600",
  responding: "#00ff88",
  done: "#00d4ff",
  error: "#ff3344",
};

export function JarvisOrb({ status }: Props) {
  const color = STATUS_COLORS[status];
  const isActive = status !== "idle" && status !== "done" && status !== "error";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        {isActive && (
          <motion.div
            className="absolute rounded-full"
            style={{ width: 140, height: 140, background: `${color}22`, border: `1px solid ${color}44` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <motion.div
          className="relative rounded-full flex items-center justify-center"
          style={{
            width: 100,
            height: 100,
            background: `radial-gradient(circle at 35% 35%, ${color}66, ${color}11)`,
            border: `2px solid ${color}`,
            boxShadow: `0 0 30px ${color}44, 0 0 60px ${color}22`,
          }}
          animate={isActive ? { boxShadow: [`0 0 30px ${color}44`, `0 0 60px ${color}88`, `0 0 30px ${color}44`] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            className="rounded-full"
            style={{ width: 40, height: 40, background: `radial-gradient(circle, ${color}, ${color}44)` }}
            animate={isActive ? { scale: [1, 0.8, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: `1px solid ${color}33` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>

      <div className="text-center">
        <motion.div
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color }}
          animate={isActive ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {STATUS_LABELS[status]}
        </motion.div>
        <div className="text-[10px] text-jarvis-muted mt-1 tracking-widest">JARVIS OS v0.1</div>
      </div>
    </div>
  );
}
