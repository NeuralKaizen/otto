import { describe, it, expect, vi } from "vitest";
import { StrictMode, createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { useAgentClient } from "./useAgentClient";

class FakeWs {
  static instances: FakeWs[] = [];
  url: string;
  readyState = 1;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWs.instances.push(this);
  }
  send(_s: string) {}
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: { conversationId: "c1", runId: "r1" } }),
  });
}

const strictWrapper = ({ children }: { children: ReactNode }) =>
  createElement(StrictMode, null, children);

describe("useAgentClient", () => {
  it("bajo StrictMode, converse sigue vivo tras el doble montaje (el cliente activo NO queda disposed)", async () => {
    FakeWs.instances = [];
    const { result } = renderHook(
      () =>
        useAgentClient({
          apiUrl: "http://x",
          wsUrl: "ws://x/ws",
          timeoutMs: 1000,
          fetchImpl: okFetch() as unknown as typeof fetch,
          createWebSocket: (u) => new FakeWs(u) as unknown as WebSocket,
        }),
      { wrapper: strictWrapper },
    );

    // StrictMode montó→desmontó→remontó: debe quedar exactamente UN socket vivo.
    await waitFor(() => {
      expect(FakeWs.instances.some((w) => !w.closed)).toBe(true);
    });
    const alive = FakeWs.instances.filter((w) => !w.closed);
    expect(alive).toHaveLength(1);

    // Y ese socket vivo es el que recibe los eventos del converse.
    const p = result.current("hola");
    await Promise.resolve();
    alive[0].emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    alive[0].emit({ type: "message_done", messageId: "m1", content: "Hola Luciano", timestamp: "t" });
    await expect(p).resolves.toEqual({ narration: "Hola Luciano", widgets: [] });
  });

  it("al desmontar de verdad, dispone el cliente (todos los sockets cerrados)", () => {
    FakeWs.instances = [];
    const { unmount } = renderHook(
      () =>
        useAgentClient({
          apiUrl: "http://x",
          wsUrl: "ws://x/ws",
          fetchImpl: okFetch() as unknown as typeof fetch,
          createWebSocket: (u) => new FakeWs(u) as unknown as WebSocket,
        }),
      { wrapper: strictWrapper },
    );
    unmount();
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });
});
