const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface ProviderStatus {
  active: string;
  realLLMEnabled: boolean;
  model: string | null;
}

export interface SocialHealthStatus {
  enabled: boolean;
  zernioEnabled: boolean;
  zernioConfigured: boolean;
  mockFallbackEnabled: boolean;
  canUseZernio?: boolean;
  configuredMode?: "zernio" | "mock" | "unavailable";
  lastKnownMode?: "zernio" | "mock" | "unavailable";
  warnings?: string[];
  checkedAt?: string;
}

export interface HealthStatus {
  ok: boolean;
  service?: string;
  wsClients?: number;
  provider?: ProviderStatus;
  social?: SocialHealthStatus;
  timestamp?: string;
}

export async function sendChat(message: string, conversationId?: string) {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId, source: "web" }),
  });
  return res.json();
}

export async function approveAction(approvalId: string) {
  const res = await fetch(`${API_URL}/approvals/${approvalId}/approve`, { method: "POST" });
  return res.json();
}

export async function rejectAction(approvalId: string, reason?: string) {
  const res = await fetch(`${API_URL}/approvals/${approvalId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

export async function fetchSkills() {
  const res = await fetch(`${API_URL}/skills`);
  return res.json();
}

export async function fetchStatus(): Promise<HealthStatus> {
  const res = await fetch(`${API_URL}/health`);
  return res.json() as Promise<HealthStatus>;
}
