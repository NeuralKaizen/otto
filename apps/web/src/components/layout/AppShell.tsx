import { useState } from "react";

const isDesktopMode =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

import { Sidebar } from "./Sidebar.js";
import { JarvisOrb } from "../jarvis/JarvisOrb.js";
import { StatusPill } from "../jarvis/StatusPill.js";
import { SystemGrid } from "../jarvis/SystemGrid.js";
import { ChatPanel } from "../chat/ChatPanel.js";
import { ActionTimeline } from "../actions/ActionTimeline.js";
import { ApprovalModal } from "../actions/ApprovalModal.js";
import { useAgentSocket } from "../../hooks/useAgentSocket.js";
import { useSystemStatus } from "../../hooks/useSystemStatus.js";

export function AppShell() {
  const [activeView, setActiveView] = useState<"chat" | "memory" | "skills" | "settings">("chat");
  const { connected, status, messages, toolCalls, approvals, isStreaming, sendMessage, sendApprovalDecision, cancelGeneration } = useAgentSocket();
  const systemStatus = useSystemStatus();

  const pendingApproval = approvals.find((a) => a.status === "pending");

  return (
    <div className="flex h-full">
      <Sidebar activeView={activeView} onViewChange={setActiveView} connected={connected} />

      <main className="flex-1 flex overflow-hidden">
        <div className="flex flex-col w-72 border-r border-jarvis-border bg-jarvis-surface p-4 gap-6">
          <div className="flex justify-center">
            <JarvisOrb status={status} />
          </div>
          <StatusPill status={status} connected={connected} />
          <SystemGrid connected={connected} providerInfo={systemStatus} />
          <div className="flex-1" />
          <div className="text-center">
            <span className={`text-[9px] tracking-widest uppercase px-2 py-0.5 rounded border ${isDesktopMode ? "text-jarvis-cyan border-jarvis-cyan border-opacity-40" : "text-jarvis-border border-jarvis-border border-opacity-40"}`}>
              {isDesktopMode ? "DESKTOP" : "WEB"}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView === "chat" && (
            <ChatPanel messages={messages} status={status} isStreaming={isStreaming} onSend={sendMessage} onCancel={cancelGeneration} />
          )}
          {activeView === "memory" && (
            <MemoryView />
          )}
          {activeView === "skills" && (
            <SkillsView />
          )}
          {activeView === "settings" && (
            <SettingsView />
          )}
        </div>

        <div className="w-64 border-l border-jarvis-border bg-jarvis-surface">
          <ActionTimeline toolCalls={toolCalls} approvals={approvals} />
        </div>
      </main>

      {pendingApproval && (
        <ApprovalModal
          approval={pendingApproval}
          onApprove={(id) => sendApprovalDecision(id, true)}
          onReject={(id) => sendApprovalDecision(id, false)}
        />
      )}
    </div>
  );
}

function MemoryView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-jarvis-cyan text-sm mb-2">Memory</div>
      <div className="text-jarvis-muted text-xs">
        Use the chat to save memories: "Recuerda que…"
        <br />
        Or search: "¿Qué recuerdas sobre…?"
      </div>
    </div>
  );
}

function SkillsView() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="text-jarvis-cyan text-sm mb-4 tracking-widest uppercase">Available Skills</div>
      {SKILLS_INFO.map((skill) => (
        <div key={skill.name} className="jarvis-card rounded p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-jarvis-cyan text-xs font-mono">{skill.name}</span>
            <span className={`text-[10px] ml-auto ${skill.requiresApproval ? "text-orange-400" : "text-green-400"}`}>
              {skill.requiresApproval ? "APPROVAL REQUIRED" : "AUTO"}
            </span>
          </div>
          <div className="text-jarvis-subtle text-xs">{skill.description}</div>
        </div>
      ))}
    </div>
  );
}

const SKILLS_INFO = [
  { name: "social_metrics_lookup", description: "Métricas de Instagram, TikTok y YouTube por @username (mock o Zernio real cuando está configurado)", requiresApproval: false },
  { name: "notion_workspace_assistant", description: "Notion dedicado: search/read/create/update vía Composio con approvals y modo read-only", requiresApproval: false },
  { name: "notion_project_intelligence", description: "Consulta tareas y proyectos en Notion (solo lectura, mock o real)", requiresApproval: false },
  { name: "generatePostIdeas", description: "Genera ideas de posts de LinkedIn desde notas de reunión", requiresApproval: false },
  { name: "saveMemory", description: "Guarda información en la memoria de Jarvis", requiresApproval: false },
  { name: "searchMemory", description: "Busca en memorias guardadas previamente", requiresApproval: false },
  { name: "getUpcomingEvents", description: "Consulta próximos eventos del calendario (mock)", requiresApproval: false },
  { name: "getSystemStatus", description: "Estado de la API, DB y proveedores configurados", requiresApproval: false },
  { name: "gmailDraftMock", description: "Crea un borrador de correo en Gmail (mock — requiere aprobación)", requiresApproval: true },
];

function SettingsView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-jarvis-cyan text-sm mb-2">Settings</div>
      <div className="text-jarvis-muted text-xs">
        Configure via <span className="text-jarvis-subtle">.env</span> file in the repo root.
        <br />
        Restart the API after changes.
      </div>
      <div className="mt-6 text-left space-y-2 text-xs text-jarvis-subtle">
        <div><span className="text-jarvis-muted">LLM_PROVIDER</span> — mock | openai</div>
        <div><span className="text-jarvis-muted">OPENAI_API_KEY</span> — optional</div>
        <div><span className="text-jarvis-muted">VOICE_PROVIDER</span> — mock | elevenlabs</div>
        <div><span className="text-jarvis-muted">ENABLE_APPROVALS</span> — true | false</div>
      </div>
    </div>
  );
}
