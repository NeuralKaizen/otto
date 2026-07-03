# Wattson HUD ↔ Agent Wiring (Voice-Only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HUD's dead `POST /converse` call with an `agentClient` that drives the real agent (`POST /chat` + `AgentEvent` WebSocket stream) and speaks its reply — voice-only, reads-only this iteration.

**Architecture:** A plain (non-React) factory `createAgentClient()` owns one persistent WebSocket and exposes the `converse: (text) => Promise<{narration, widgets}>` seam the session FSM already expects. It POSTs `/chat`, binds to the run's `messageId` from `message_started`, and resolves with `message_done.content`. Approvals (writes) are auto-declined audibly. The FSM, TTS/STT/wake adapters, and widget components are unchanged.

**Tech Stack:** TypeScript, React 19 + Vite (`apps/hud`), Vitest + jsdom, `@wattson/shared` for the `AgentEvent` contract.

**Spec:** `docs/superpowers/specs/2026-07-02-wattson-voice-chat-wiring-design.md`

## Global Constraints

- **Voice-only, reads-only iteration.** No visual chat/tool/approval UI; no widget rendering (backend emits none → `widgets: []` always).
- **The FSM (`apps/hud/src/voice/sessionMachine.ts`), `useSession.ts`, and the voice adapters are NOT modified.** The only seam is the injected `converse` dependency.
- **`converse` must never hang** — every path settles (resolve or reject) within `timeoutMs` (default 30000).
- **Approvals fire** (Composio enabled locally). On `approval_requested`: send `approval_decision {approved:false}` over the WS AND resolve with the canned narration `"Todavía no puedo ejecutar acciones que requieren aprobación; eso llega en la próxima versión."` — do not reject, do not hang.
- **Config:** `import.meta.env.VITE_API_URL` (default `http://localhost:4000`), `VITE_WS_URL` (default `ws://localhost:4000/ws`). WS path is `/ws`.
- **Contract source of truth:** import `AgentEvent` from `@wattson/shared` (add it as a `workspace:*` dependency of `@wattson/hud`).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work from `/home/newral/Lucianos/otto`, branch `feat/wattson-voice-wiring`.

## File Structure

- **Create** `apps/hud/src/api/agentClient.ts` — the factory: WS lifecycle + `converse` + `dispose`. One responsibility: bridge the async `/chat`+WS protocol into the FSM's single-shot `converse` promise.
- **Create** `apps/hud/src/api/agentClient.test.ts` — Vitest unit tests with injected fake `fetch` and fake `WebSocket`.
- **Modify** `apps/hud/package.json` — add `"@wattson/shared": "workspace:*"`.
- **Modify** `apps/hud/src/App.tsx` — create one `agentClient` (memoized) and pass `agentClient.converse` as the `converse` dep; dispose on unmount.
- **Delete** `apps/hud/src/api/converse.ts` and `apps/hud/src/api/converse.test.ts` (replaced).

The `AgentEvent` fields used (from `packages/shared/src/events.ts`): `message_started { messageId, provider, model? }`, `message_done { messageId, content, cancelled? }`, `approval_requested { approvalId, toolName, summary }`, `error { error }`.

---

## Task 1: `agentClient` — happy path (reads)

**Files:**
- Create: `apps/hud/src/api/agentClient.ts`
- Create: `apps/hud/src/api/agentClient.test.ts`
- Modify: `apps/hud/package.json` (add `@wattson/shared`)

**Interfaces:**
- Produces: `createAgentClient(options?: AgentClientOptions): AgentClient` where
  `AgentClient = { converse(text: string): Promise<ConverseResult>; dispose(): void }`,
  `ConverseResult = { narration: string; widgets: RenderedWidget[] }` (from `../voice/types`),
  `AgentClientOptions = { apiUrl?; wsUrl?; timeoutMs?; fetchImpl?: typeof fetch; createWebSocket?: (url: string) => WebSocket }`.
  Also exports `const APPROVAL_DECLINE_NARRATION: string`.

- [ ] **Step 1: Add `@wattson/shared` to the HUD and install**

Edit `apps/hud/package.json` — add to `dependencies`:
```json
"@wattson/shared": "workspace:*",
```
Then run: `cd /home/newral/Lucianos/otto && pnpm install`
Expected: `@wattson/hud` now resolves `@wattson/shared`.

- [ ] **Step 2: Write the failing happy-path test**

Create `apps/hud/src/api/agentClient.test.ts`:
```ts
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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- agentClient`
Expected: FAIL — `createAgentClient` is not defined / module not found.

- [ ] **Step 4: Implement `agentClient.ts` (happy path + lifecycle)**

Create `apps/hud/src/api/agentClient.ts`:
```ts
import type { AgentEvent } from "@wattson/shared";
import type { RenderedWidget } from "../voice/types";

const DEFAULT_API_URL = "http://localhost:4000";
const DEFAULT_WS_URL = "ws://localhost:4000/ws";
const DEFAULT_TIMEOUT_MS = 30000;
const RECONNECT_MS = 1500;

export const APPROVAL_DECLINE_NARRATION =
  "Todavía no puedo ejecutar acciones que requieren aprobación; eso llega en la próxima versión.";

export interface ConverseResult {
  narration: string;
  widgets: RenderedWidget[];
}

export interface AgentClient {
  converse(text: string): Promise<ConverseResult>;
  dispose(): void;
}

export interface AgentClientOptions {
  apiUrl?: string;
  wsUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  createWebSocket?: (url: string) => WebSocket;
}

interface PendingRun {
  messageId: string | null;
  resolve: (r: ConverseResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createAgentClient(options: AgentClientOptions = {}): AgentClient {
  const apiUrl = options.apiUrl ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
  const wsUrl = options.wsUrl ?? import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const makeWs = options.createWebSocket ?? ((url: string) => new WebSocket(url));

  let ws: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let conversationId: string | undefined;
  let pending: PendingRun | null = null;

  function connect(): void {
    if (disposed) return;
    ws = makeWs(wsUrl);
    ws.onmessage = (ev: MessageEvent) => handleEvent(ev);
    ws.onclose = () => {
      ws = null;
      if (!disposed) reconnectTimer = setTimeout(connect, RECONNECT_MS);
    };
  }

  function settleResolve(r: ConverseResult): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(r);
  }

  function settleReject(err: Error): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { reject } = pending;
    pending = null;
    reject(err);
  }

  function sendJson(msg: unknown): void {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function handleEvent(ev: MessageEvent): void {
    if (!pending) return;
    let e: AgentEvent;
    try {
      e = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)) as AgentEvent;
    } catch {
      return;
    }
    switch (e.type) {
      case "message_started":
        if (pending.messageId === null) pending.messageId = e.messageId;
        break;
      case "message_done":
        if (e.messageId === pending.messageId) {
          if (e.content && e.content.trim()) settleResolve({ narration: e.content, widgets: [] });
          else settleReject(new Error("empty response"));
        }
        break;
      case "approval_requested":
        sendJson({ type: "approval_decision", approvalId: e.approvalId, approved: false, reason: "approvals not wired in HUD yet" });
        settleResolve({ narration: APPROVAL_DECLINE_NARRATION, widgets: [] });
        break;
      case "error":
        settleReject(new Error(e.error));
        break;
      default:
        break;
    }
  }

  function converse(text: string): Promise<ConverseResult> {
    return new Promise<ConverseResult>((resolve, reject) => {
      if (pending) {
        reject(new Error("converse already in progress"));
        return;
      }
      const timer = setTimeout(() => settleReject(new Error("response timeout")), timeoutMs);
      pending = { messageId: null, resolve, reject, timer };

      fetchImpl(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, source: "voice", conversationId }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`chat failed: ${r.status}`);
          return r.json() as Promise<{ ok: boolean; data?: { conversationId?: string; runId?: string } }>;
        })
        .then((body) => {
          if (body?.data?.conversationId) conversationId = body.data.conversationId;
        })
        .catch((err: unknown) => settleReject(err instanceof Error ? err : new Error(String(err))));
    });
  }

  function dispose(): void {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    settleReject(new Error("client disposed"));
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  connect();
  return { converse, dispose };
}
```

Note (dev-only): under React StrictMode a double-mount can create a second client; the discarded one's idle socket is harmless (its `pending` stays null). Production builds mount once.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- agentClient`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck and commit**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud typecheck`
Expected: PASS.
```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/api/agentClient.ts apps/hud/src/api/agentClient.test.ts apps/hud/package.json pnpm-lock.yaml
git commit -m "feat(hud): agentClient — POST /chat + WS message stream (happy path)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `agentClient` — failure modes (error, timeout, approval, empty)

**Files:**
- Modify: `apps/hud/src/api/agentClient.test.ts` (add cases)

**Interfaces:**
- Consumes: `createAgentClient` and `APPROVAL_DECLINE_NARRATION` from Task 1. The implementation in Task 1 already handles these paths; Task 2 proves them with tests. If a test reveals a gap, fix `agentClient.ts` minimally.

- [ ] **Step 1: Add the failure-mode tests**

Append to `apps/hud/src/api/agentClient.test.ts` inside the `describe` block (the `FakeWs`, `okFetch`, and `setup` helpers from Task 1 are reused):
```ts
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
```

- [ ] **Step 2: Run the tests**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- agentClient`
Expected: PASS — all agentClient cases green (happy path + 6 failure/behavior cases). If any fails, fix `agentClient.ts` minimally (do not weaken the test) and re-run.

- [ ] **Step 3: Commit**

```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/api/agentClient.test.ts apps/hud/src/api/agentClient.ts
git commit -m "test(hud): agentClient failure modes (error, timeout, approval decline, empty, conversationId)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire `agentClient` into the HUD; remove the old `converse`

**Files:**
- Modify: `apps/hud/src/App.tsx`
- Delete: `apps/hud/src/api/converse.ts`, `apps/hud/src/api/converse.test.ts`

**Interfaces:**
- Consumes: `createAgentClient` from Task 1.

- [ ] **Step 1: Rewire `App.tsx`**

In `apps/hud/src/App.tsx`:
- Replace the import on line 6 `import { callConverse } from "./api/converse";` with:
```ts
import { createAgentClient } from "./api/agentClient";
```
- Replace the `deps` block (lines 51–58) with an `agentClient` created once, disposed on unmount, and used as the `converse` dep:
```ts
  const agentClient = useMemo(() => createAgentClient(), []);
  useEffect(() => () => agentClient.dispose(), [agentClient]);

  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new SpeechSynthesisSpeaker(),
    converse: agentClient.converse,
    closingPhrase: "listo",
    silenceMs: 35000,
  }), [agentClient]);
```
(`useMemo` and `useEffect` are already imported on line 1.)

- [ ] **Step 2: Delete the old adapter and its test**

```bash
cd /home/newral/Lucianos/otto
git rm apps/hud/src/api/converse.ts apps/hud/src/api/converse.test.ts
```

- [ ] **Step 3: Typecheck, test, build**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud typecheck && pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud build`
Expected: typecheck PASS; the full HUD suite PASSES (the `converse.test.ts` cases are gone, the `agentClient.test.ts` cases are present; the FSM/`useSession` suites are unchanged and green); build produces `apps/hud/dist`. Record the new test count.

- [ ] **Step 4: Commit**

```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/App.tsx
git commit -m "feat(hud): wire agentClient as the voice converse seam; drop dead /converse adapter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual end-to-end verification (human, not automated)**

The browser mic/speaker/WebSocket path can't be unit-tested headlessly. Verify by hand:
1. Terminal A: `cd /home/newral/Lucianos/otto && pnpm dev:api` (backend on :4000, real OpenAI brain per root `.env`).
2. Terminal B: `cd /home/newral/Lucianos/otto && VITE_API_URL=http://localhost:4000 VITE_WS_URL=ws://localhost:4000/ws pnpm --filter @wattson/hud dev` (or put those in `apps/hud/.env.local`).
3. Open the HUD in a browser, say the wake word, ask a **read** question (e.g. "¿qué podés hacer?" or "¿cómo vienen mis métricas?"). Confirm the HUD speaks the agent's real reply.
4. Ask for a **write** (e.g. "creá una tarea en Notion"). Confirm the HUD speaks the approval-decline narration and returns to listening (no hang).

This step is a checklist for the user; it does not block the automated task gates.

---

## Self-Review

- **Spec coverage:** the seam/factory (Task 1), WS lifecycle + correlation by `messageId` (Task 1), `message_done.content` resolution (Task 1), error/timeout/empty/cancelled + approval auto-decline (Task 2), config via `VITE_API_URL`/`VITE_WS_URL` (Task 1 impl), `@wattson/shared` contract dep (Task 1), App wiring + delete old `converse` (Task 3), voice-only/widgets-`[]` (throughout), manual E2E (Task 3 Step 5). All spec sections map to a task. ✅
- **Placeholder scan:** every code step contains complete code; commands have expected outcomes; no TBD/"handle errors" hand-waves. ✅
- **Type consistency:** `createAgentClient`/`AgentClient`/`ConverseResult`/`AgentClientOptions`/`APPROVAL_DECLINE_NARRATION` are named identically across tasks; `ConverseResult` matches the FSM's expected `{ narration: string; widgets: RenderedWidget[] }` (`apps/hud/src/voice/types.ts`); `AgentEvent` field access matches `packages/shared/src/events.ts`. ✅
