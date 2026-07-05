import type { SystemStatus } from "../../hooks/useSystemStatus.js";

interface Props {
  connected: boolean;
  providerInfo?: SystemStatus;
}

export function SystemGrid({ connected, providerInfo }: Props) {
  const providerLabel = providerInfo?.provider ? providerInfo.provider.toUpperCase() : "MOCK";
  const providerValue = providerInfo?.model ? `${providerLabel} ${providerInfo.model}` : providerLabel;
  const items = [
    { label: "CORE", value: "ONLINE", ok: true },
    { label: "API", value: connected ? "LINKED" : "OFFLINE", ok: connected },
    { label: "DB", value: "SQLITE", ok: true },
    { label: "LLM", value: providerValue, ok: true },
    { label: "VOICE", value: "MOCK", ok: true },
    { label: "SKILLS", value: "6 LOADED", ok: true },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="wattson-card rounded p-2 text-center">
          <div className="text-[9px] text-wattson-muted tracking-widest mb-0.5">{item.label}</div>
          <div className={`text-[10px] font-semibold tracking-wider ${item.ok ? "text-wattson-cyan" : "text-red-400"}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
