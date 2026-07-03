import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Check, X } from "lucide-react";
import type { DisplayApproval } from "../../lib/types.js";

interface Props {
  approval: DisplayApproval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalModal({ approval, onApprove, onReject }: Props) {
  const [showArgs, setShowArgs] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="jarvis-card rounded-xl p-6 max-w-md w-full"
          style={{ border: "1px solid #ff660088", boxShadow: "0 0 40px #ff660022" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={20} className="text-orange-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-orange-300">Approval Required</div>
              <div className="text-xs text-jarvis-muted font-mono">{approval.toolName}</div>
            </div>
          </div>

          {(approval.toolkit || approval.action || approval.risk) && (
            <div className="flex flex-wrap gap-2 mb-3 text-[11px] font-mono">
              {approval.toolkit && (
                <span className="px-2 py-0.5 rounded bg-jarvis-bg text-jarvis-subtle border border-jarvis-border">
                  Toolkit: {approval.toolkit}
                </span>
              )}
              {approval.action && (
                <span className="px-2 py-0.5 rounded bg-jarvis-bg text-jarvis-subtle border border-jarvis-border">
                  Action: {approval.action}
                </span>
              )}
              {approval.risk && (
                <span className="px-2 py-0.5 rounded bg-jarvis-bg text-jarvis-subtle border border-jarvis-border">
                  Risk: {approval.risk}
                </span>
              )}
            </div>
          )}

          <p className="text-sm text-jarvis-text mb-4 whitespace-pre-wrap">{approval.summary}</p>

          {(approval.risk === "write" || approval.risk === "send" || approval.risk === "delete") && (
            <div className="text-xs text-orange-300 bg-orange-500 bg-opacity-10 border border-orange-500 border-opacity-40 rounded p-2 mb-4">
              Esta acción puede modificar o eliminar datos externos. Revisa los detalles antes de aprobar.
            </div>
          )}

          <button
            onClick={() => setShowArgs((v) => !v)}
            className="text-xs text-jarvis-muted hover:text-jarvis-subtle mb-3"
          >
            {showArgs ? "▼ Hide" : "▶ Show"} arguments
          </button>

          {showArgs && (
            <pre className="text-[10px] text-jarvis-subtle bg-jarvis-bg rounded p-3 overflow-auto max-h-40 mb-4">
              {JSON.stringify(approval.args, null, 2)}
            </pre>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => onReject(approval.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs text-red-300 border border-red-500 hover:bg-red-500 hover:bg-opacity-20 transition-colors"
            >
              <X size={14} /> Reject
            </button>
            <button
              onClick={() => onApprove(approval.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs text-green-300 border border-green-500 hover:bg-green-500 hover:bg-opacity-20 transition-colors"
            >
              <Check size={14} /> Approve
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
