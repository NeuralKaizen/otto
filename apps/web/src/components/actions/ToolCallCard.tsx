import { motion } from "framer-motion";
import { Wrench, CheckCircle, XCircle, Loader, ShieldAlert, Globe, Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { DisplayToolCall } from "../../lib/types.js";
import { formatTime } from "../../lib/utils.js";

interface Props {
  toolCall: DisplayToolCall;
}

// --- Social source meta -----------------------------------------------------

function getSocialSourceMeta(result: unknown): { label: string; tone: string; warning?: string } | null {
  if (!result || typeof result !== "object") return null;
  const payload = result as { dataSource?: string; isMock?: boolean; warnings?: string[] };
  if (typeof payload.dataSource !== "string") return null;
  if (payload.dataSource === "zernio") return { label: "Fuente: Zernio", tone: "text-green-400", warning: payload.warnings?.[0] };
  if (payload.dataSource === "mock") return { label: "Fuente: Mock / datos simulados", tone: "text-yellow-300", warning: payload.warnings?.[0] ?? "Zernio no configurado o no disponible." };
  if (payload.dataSource === "unavailable") return { label: "Fuente: Servicio no disponible", tone: "text-red-400", warning: payload.warnings?.[0] ?? "No se pudo obtener data social." };
  return null;
}

// --- Composio meta ----------------------------------------------------------

const TOOLKIT_LABELS: Record<string, string> = {
  notion: "Notion",
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  slack: "Slack",
  github: "GitHub",
};

const RISK_COLORS: Record<string, string> = {
  read: "text-green-400",
  write: "text-orange-400",
  send: "text-orange-400",
  delete: "text-red-400",
  unknown: "text-wattson-muted",
};

interface ComposioMeta {
  toolkitLabel: string;
  action: string;
  modeBadge: string;
  modeTone: string;
  riskLabel: string;
  riskTone: string;
  summary: string;
  limitation?: string;
  blocked: boolean;
  requiresApproval: boolean;
}

function getComposioMeta(result: unknown): ComposioMeta | null {
  if (!result || typeof result !== "object") return null;
  const r = result as {
    toolkit?: string;
    action?: string;
    source?: string;
    blocked?: boolean;
    requiresApproval?: boolean;
    summary?: string;
    limitations?: string[];
    enabled?: boolean;
  };
  if (typeof r.toolkit !== "string" && typeof r.source !== "string") return null;
  if (!("blocked" in r) && !("requiresApproval" in r) && !("summary" in r)) return null;

  const toolkit = r.toolkit ?? "unknown";
  const action = r.action ?? "";
  const source = r.source ?? "none";
  const blocked = r.blocked ?? false;
  const requiresApproval = r.requiresApproval ?? false;
  const summary = typeof r.summary === "string" ? r.summary : "";
  const limitation = r.limitations?.[0];

  const toolkitLabel = TOOLKIT_LABELS[toolkit] ?? toolkit;

  let modeBadge: string;
  let modeTone: string;
  if (blocked) {
    modeBadge = "Blocked";
    modeTone = "text-red-400";
  } else if (requiresApproval) {
    modeBadge = "Approval required";
    modeTone = "text-orange-400";
  } else if (source === "composio_api") {
    modeBadge = "Real";
    modeTone = "text-green-400";
  } else if (source === "mock") {
    modeBadge = "Mock";
    modeTone = "text-yellow-300";
  } else {
    modeBadge = "Unavailable";
    modeTone = "text-wattson-muted";
  }

  const riskFromAction = /\b(create|update|patch|edit|assign|comment)\b/i.test(action) ? "write"
    : /\b(send|invite|share|publish)\b/i.test(action) ? "send"
    : /\b(delete|remove|archive)\b/i.test(action) ? "delete"
    : /\b(get|list|search|query|find|fetch)\b/i.test(action) ? "read"
    : "unknown";

  const riskLabel = riskFromAction.charAt(0).toUpperCase() + riskFromAction.slice(1);
  const riskTone = RISK_COLORS[riskFromAction] ?? "text-wattson-muted";

  return { toolkitLabel, action, modeBadge, modeTone, riskLabel, riskTone, summary, limitation, blocked, requiresApproval };
}

// --- Dedicated Notion meta --------------------------------------------------

interface NotionMeta {
  actionLabel: string;
  modeBadge: string;
  modeTone: string;
  riskLabel: string;
  riskTone: string;
  summary: string;
  limitation?: string;
  blocked: boolean;
  requiresApproval: boolean;
}

function getNotionMeta(result: unknown): NotionMeta | null {
  if (!result || typeof result !== "object") return null;
  const r = result as {
    provider?: string;
    action?: string;
    mode?: string;
    risk?: string;
    blocked?: boolean;
    requiresApproval?: boolean;
    summary?: string;
    limitations?: string[];
  };
  if (r.provider !== "composio" || typeof r.action !== "string") return null;

  const blocked = r.blocked ?? false;
  const requiresApproval = r.requiresApproval ?? false;
  const mode = r.mode ?? "unavailable";
  const risk = r.risk ?? "read";

  let modeBadge = "Unavailable";
  let modeTone = "text-wattson-muted";
  if (blocked) {
    modeBadge = "Blocked";
    modeTone = "text-red-400";
  } else if (requiresApproval) {
    modeBadge = "Approval required";
    modeTone = "text-orange-400";
  } else if (mode === "real") {
    modeBadge = "Real";
    modeTone = "text-green-400";
  } else if (mode === "mock") {
    modeBadge = "Mock";
    modeTone = "text-yellow-300";
  }

  return {
    actionLabel: r.action.replace(/^notion_/, "").replace(/_/g, " "),
    modeBadge,
    modeTone,
    riskLabel: risk === "write" ? "Write" : "Read",
    riskTone: risk === "write" ? "text-orange-400" : "text-green-400",
    summary: typeof r.summary === "string" ? r.summary : "",
    limitation: r.limitations?.[0],
    blocked,
    requiresApproval,
  };
}

// --- Card -------------------------------------------------------------------

export function ToolCallCard({ toolCall }: Props) {
  let icon: ReactNode;
  if (toolCall.status === "running") {
    icon = (
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
        <Loader size={12} className="text-yellow-400" />
      </motion.div>
    );
  } else if (toolCall.status === "completed") {
    icon = <CheckCircle size={12} className="text-green-400" />;
  } else {
    icon = <XCircle size={12} className="text-red-400" />;
  }

  const socialSource = toolCall.toolName === "social_metrics_lookup"
    ? getSocialSourceMeta(toolCall.result)
    : null;

  const composioMeta = toolCall.toolName === "composio_tool_gateway"
    ? getComposioMeta(toolCall.result)
    : null;

  const notionMeta = toolCall.toolName === "notion_workspace_assistant"
    ? getNotionMeta(toolCall.result)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="wattson-card rounded p-2 text-xs border-l-2 border-yellow-500"
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <Wrench size={10} className="text-wattson-muted" />
        <span className="text-yellow-300 font-mono">{toolCall.toolName}</span>
        <span className="text-wattson-muted ml-auto">{formatTime(toolCall.startedAt)}</span>
      </div>

      {/* Composio-specific card body */}
      {composioMeta && (
        <div className="mt-1 space-y-1">
          {/* Toolkit + action row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Globe size={9} className="text-wattson-cyan" />
              <span className="text-wattson-cyan font-semibold">{composioMeta.toolkitLabel}</span>
            </div>
            {composioMeta.action && (
              <span className="text-[10px] text-wattson-subtle font-mono truncate max-w-[120px]" title={composioMeta.action}>
                {composioMeta.action.replace(/^[A-Z]+_/, "").replace(/_/g, " ").toLowerCase()}
              </span>
            )}
          </div>

          {/* Mode + risk badges */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-widest font-semibold ${composioMeta.modeTone}`}>
              {composioMeta.blocked ? <><Lock size={9} className="inline mr-0.5" />{composioMeta.modeBadge}</> : composioMeta.requiresApproval ? <><ShieldAlert size={9} className="inline mr-0.5" />{composioMeta.modeBadge}</> : composioMeta.modeBadge}
            </span>
            <span className={`text-[10px] ${composioMeta.riskTone}`}>{composioMeta.riskLabel}</span>
          </div>

          {/* Summary (first line only) */}
          {toolCall.status === "completed" && composioMeta.summary && (
            <div className="text-wattson-subtle text-[10px] truncate" title={composioMeta.summary}>
              {composioMeta.summary.split("\n")[0]}
            </div>
          )}

          {/* Limitation note */}
          {composioMeta.limitation && (
            <div className="text-yellow-400 text-[10px] truncate" title={composioMeta.limitation}>
              ⚠ {composioMeta.limitation}
            </div>
          )}
        </div>
      )}

      {notionMeta && (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Globe size={9} className="text-wattson-cyan" />
              <span className="text-wattson-cyan font-semibold">Notion</span>
            </div>
            <span className="text-[10px] text-wattson-subtle font-mono truncate max-w-[120px]" title={notionMeta.actionLabel}>
              {notionMeta.actionLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-widest font-semibold ${notionMeta.modeTone}`}>
              {notionMeta.blocked ? <><Lock size={9} className="inline mr-0.5" />{notionMeta.modeBadge}</> : notionMeta.requiresApproval ? <><ShieldAlert size={9} className="inline mr-0.5" />{notionMeta.modeBadge}</> : notionMeta.modeBadge}
            </span>
            <span className={`text-[10px] ${notionMeta.riskTone}`}>{notionMeta.riskLabel}</span>
          </div>

          {toolCall.status === "completed" && notionMeta.summary && (
            <div className="text-wattson-subtle text-[10px] truncate" title={notionMeta.summary}>
              {notionMeta.summary.split("\n")[0]}
            </div>
          )}

          {notionMeta.limitation && (
            <div className="text-yellow-400 text-[10px] truncate" title={notionMeta.limitation}>
              ⚠ {notionMeta.limitation}
            </div>
          )}
        </div>
      )}

      {/* Social source meta */}
      {socialSource && (
        <div className="mt-1 space-y-1">
          <div className={`text-[10px] uppercase tracking-widest ${socialSource.tone}`}>
            {socialSource.label}
          </div>
          {socialSource.warning && (
            <div className="text-[10px] text-wattson-subtle truncate">
              {socialSource.warning}
            </div>
          )}
        </div>
      )}

      {/* Generic result preview (non-Composio, non-social) */}
      {!composioMeta && !notionMeta && !socialSource && toolCall.status === "completed" && toolCall.result !== undefined && (
        <div className="text-wattson-subtle text-[10px] mt-1 truncate">
          Done · {JSON.stringify(toolCall.result).slice(0, 80)}…
        </div>
      )}
    </motion.div>
  );
}
