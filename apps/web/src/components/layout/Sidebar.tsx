import { MessageSquare, Brain, Cpu, Settings, Wifi, WifiOff } from "lucide-react";

type View = "chat" | "memory" | "skills" | "settings";

interface Props {
  activeView: View;
  onViewChange: (view: View) => void;
  connected: boolean;
}

const NAV_ITEMS: { view: View; icon: typeof MessageSquare; label: string }[] = [
  { view: "chat", icon: MessageSquare, label: "Chat" },
  { view: "memory", icon: Brain, label: "Memory" },
  { view: "skills", icon: Cpu, label: "Skills" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export function Sidebar({ activeView, onViewChange, connected }: Props) {
  return (
    <aside className="w-48 flex flex-col border-r border-wattson-border bg-wattson-surface">
      <div className="p-4 border-b border-wattson-border">
        <div className="text-wattson-cyan font-semibold text-sm tracking-widest">WATTSON OS</div>
        <div className="text-[9px] text-wattson-muted mt-0.5 tracking-wider">LOCAL-FIRST ASSISTANT</div>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
              activeView === view
                ? "bg-wattson-card text-wattson-cyan border border-wattson-border"
                : "text-wattson-muted hover:text-wattson-subtle hover:bg-wattson-card"
            }`}
          >
            <Icon size={14} />
            <span className="tracking-wide">{label}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-wattson-border">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <Wifi size={12} className="text-wattson-cyan" />
              <span className="text-wattson-cyan">API Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-red-400" />
              <span className="text-red-400">Disconnected</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
