import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import type { DisplayToolCall, DisplayApproval } from "../../lib/types.js";
import { ToolCallCard } from "./ToolCallCard.js";
import { formatTime } from "../../lib/utils.js";

interface Props {
  toolCalls: DisplayToolCall[];
  approvals: DisplayApproval[];
}

export function ActionTimeline({ toolCalls, approvals }: Props) {
  const hasActivity = toolCalls.length > 0 || approvals.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-wattson-border">
        <Activity size={14} className="text-wattson-cyan" />
        <span className="text-xs text-wattson-subtle tracking-widest uppercase">Action Timeline</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!hasActivity && (
          <div className="text-[11px] text-wattson-border text-center mt-6">No actions yet</div>
        )}

        <AnimatePresence>
          {approvals.map((approval) => (
            <motion.div
              key={approval.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`wattson-card rounded p-2 text-xs border-l-2 ${
                approval.status === "pending"
                  ? "border-orange-500"
                  : approval.status === "approved"
                  ? "border-green-500"
                  : "border-red-500"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-wattson-muted">APPROVAL</span>
                <span className="font-mono text-orange-300">{approval.toolName}</span>
                <span
                  className={`ml-auto text-[10px] uppercase font-semibold ${
                    approval.status === "pending"
                      ? "text-orange-400"
                      : approval.status === "approved"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {approval.status}
                </span>
              </div>
              <div className="text-wattson-subtle mt-0.5 text-[10px]">{formatTime(approval.createdAt)}</div>
            </motion.div>
          ))}

          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
