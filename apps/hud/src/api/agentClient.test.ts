import { describe, it, expect, vi } from "vitest";
import { createAgentClient, APPROVAL_DECLINE_NARRATION } from "./agentClient";

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

  it("sends learned conversationId on the second call", async () => {
    const { client, sock, fetchMock } = setup();
    const p1 = client.converse("uno");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "ok", timestamp: "t" });
    await p1;
    const p2 = client.converse("dos");
    await Promise.resolve();
    const body2 = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(body2.conversationId).toBe("c1");
    sock.emit({ type: "message_started", messageId: "m2", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m2", content: "ok2", timestamp: "t" });
    await expect(p2).resolves.toEqual({ narration: "ok2", widgets: [] });
    client.dispose();
  });

  it("rejects on error event", async () => {
    const { client, sock } = setup();
    const p = client.converse("x");
    await Promise.resolve();
    sock.emit({ type: "error", error: "boom", timestamp: "t" });
    await expect(p).rejects.toThrow("boom");
    client.dispose();
  });

  it("rejects when message_done content is empty", async () => {
    const { client, sock } = setup();
    const p = client.converse("x");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "", timestamp: "t" });
    await expect(p).rejects.toThrow(/empty/);
    client.dispose();
  });

  it("rejects on POST failure", async () => {
    const badFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { client } = setup(badFetch);
    await expect(client.converse("x")).rejects.toThrow(/500/);
    client.dispose();
  });

  it("rejects on timeout with no message_done", async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const p = client.converse("x");
    const assertion = expect(p).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    client.dispose();
    vi.useRealTimers();
  });

  it("declines approval audibly and sends approval_decision reject over WS", async () => {
    const { client, sock } = setup();
    const p = client.converse("creá una tarea en Notion");
    await Promise.resolve();
    sock.emit({ type: "approval_requested", approvalId: "a1", toolName: "notion.createTask", summary: "crear tarea", args: {}, timestamp: "t" });
    await expect(p).resolves.toEqual({ narration: APPROVAL_DECLINE_NARRATION, widgets: [] });
    const sent = JSON.parse(sock.sent[0]);
    expect(sent).toMatchObject({ type: "approval_decision", approvalId: "a1", approved: false });
    client.dispose();
  });

  it("rejects an in-flight converse when disposed", async () => {
    const { client } = setup();
    const p = client.converse("x");
    await Promise.resolve();
    client.dispose();
    await expect(p).rejects.toThrow(/disposed/);
  });

  it("rejects a second converse while one is in progress", async () => {
    const { client, sock } = setup();
    const p1 = client.converse("uno");
    await Promise.resolve();
    await expect(client.converse("dos")).rejects.toThrow(/in progress/);
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "ok", timestamp: "t" });
    await expect(p1).resolves.toEqual({ narration: "ok", widgets: [] });
    client.dispose();
  });

  it("rejects when fetch throws (network error)", async () => {
    const throwFetch = vi.fn().mockRejectedValue(new Error("network down"));
    const { client } = setup(throwFetch);
    await expect(client.converse("x")).rejects.toThrow(/network down/);
    client.dispose();
  });
});
