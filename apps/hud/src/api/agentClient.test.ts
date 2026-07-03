import { describe, it, expect, vi } from "vitest";
import { createAgentClient, APPROVAL_DECLINE_NARRATION } from "./agentClient";

// Referenced only to assert the export exists at compile time; behavior is
// asserted in Task 2 (approval-decline path).
void APPROVAL_DECLINE_NARRATION;

class FakeWs {
  url: string;
  readyState = 1;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  constructor(url: string) { this.url = url; }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = 3; this.onclose?.(); }
  emit(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

function okFetch(conversationId = "c1", runId = "r1") {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: { conversationId, runId } }),
  });
}

function setup(fetchMock = okFetch()) {
  let sock!: FakeWs;
  const client = createAgentClient({
    apiUrl: "http://x",
    wsUrl: "ws://x/ws",
    timeoutMs: 1000,
    fetchImpl: fetchMock as unknown as typeof fetch,
    createWebSocket: (u) => (sock = new FakeWs(u)) as unknown as WebSocket,
  });
  return { client, get sock() { return sock; }, fetchMock };
}

describe("agentClient", () => {
  it("resolves with message_done content and POSTs /chat", async () => {
    const { client, sock, fetchMock } = setup();
    const p = client.converse("hola");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "Hola Luciano", timestamp: "t" });
    await expect(p).resolves.toEqual({ narration: "Hola Luciano", widgets: [] });
    expect(fetchMock).toHaveBeenCalledWith("http://x/chat", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ message: "hola", source: "voice" });
    client.dispose();
  });
});
