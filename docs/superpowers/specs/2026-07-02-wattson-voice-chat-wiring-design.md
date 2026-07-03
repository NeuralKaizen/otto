# Wattson HUD ↔ Agent Wiring (Voice-Only) — Design Spec

**Date:** 2026-07-02
**Status:** Approved (design) — awaiting spec review before writing-plans
**Scope:** Plan B, iteration 1. Wire the Wattson HUD's voice loop to the real agent backend (`@wattson/api`) over its `POST /chat` + `AgentEvent` WebSocket protocol. Voice-only.

## Goal

Replace the HUD's dead synchronous `POST /converse` call with an adapter that drives the real agent: `POST /chat`, then consume the streamed `AgentEvent`s over WebSocket, and speak the agent's final reply. The HUD's voice FSM, TTS, barge-in, and silence-timer are unchanged.

## Context

- The HUD (`apps/hud`) is a voice-first interface. Its session FSM (`apps/hud/src/voice/sessionMachine.ts`) is: `idle → listening → processing → speaking → listening`. The FSM's only external I/O for a query is the injected dependency `converse: (text) => Promise<{ narration: string; widgets: RenderedWidget[] }>` (see `apps/hud/src/voice/useSession.ts:17`, effect `callConverse` at line 75–81). On `response` the FSM speaks `narration` and renders `widgets`.
- The old adapter `apps/hud/src/api/converse.ts` calls `POST {BASE}/converse` and returns `{ narration, widgets }`. That endpoint no longer exists (the Python backend was removed).
- The real backend (`@wattson/api`, Fastify):
  - `POST /chat` with body `{ conversationId?: string; message: string; source: "web"|"voice"|"cli" }` returns immediately `{ ok: true, data: { runId: string; conversationId: string } }`. The agent runs asynchronously.
  - `GET /ws` (WebSocket): the server **broadcasts** every `AgentEvent` (as JSON) to all connected clients. There is no per-client/per-run filtering.
  - The event contract lives in `@wattson/shared` (`packages/shared/src/events.ts`): `AgentEvent` is a discriminated union on `type`:
    `status | intent_detected | plan_created | message_started | message_delta | message_done | tool_call_started | tool_call_completed | approval_requested | approval_resolved | error`.
    Relevant fields: `message_started { messageId, provider, model? }`, `message_delta { messageId, delta }`, `message_done { messageId, content, cancelled? }`, `error { error }`.
  - Client→server WS messages exist for `approval_decision`/`approval_response` and `cancel_generation`. This iteration uses only `approval_decision` (to auto-reject writes; see approval handling below); `cancel_generation` is not used.
- **Local backend config** (from the colleague's real `.env`, now at repo root, gitignored): real OpenAI brain (`gpt-4o-mini`), Composio **enabled** (Notion/Gmail/Google Calendar) with reads free and writes gated behind approval, Zernio social metrics read-only. Net effect for this iteration: **reads work end-to-end**; **writes trigger an approval** that we auto-decline audibly (approval UX is iteration 2).
- Reference implementation to port from (colleague's web client): `apps/web/src/lib/api.ts` (`sendChat`) and `apps/web/src/hooks/useAgentSocket.ts` (WS consumer).

## Design

### The seam: an agent client module

Introduce `apps/hud/src/api/agentClient.ts` — a plain (non-React) factory that owns one persistent WebSocket connection and exposes the `converse` function the FSM expects. It is instantiated once in `App.tsx` and passed to `useSession` as a referentially-stable dependency (the same way `wake`/`stt`/`tts` already are — `useSession` requires stable deps).

```
createAgentClient({ apiUrl, wsUrl }): {
  converse(text: string): Promise<{ narration: string; widgets: RenderedWidget[] }>
  dispose(): void
}
```

Responsibilities:
1. **Connection lifecycle.** On creation, open `new WebSocket(wsUrl)`. Auto-reconnect with backoff if it drops (so events are never missed while idle). The connection is persistent and independent of any single query.
2. **`converse(text)`:**
   a. Persist `conversationId` across calls (module-scoped; `undefined` on first call).
   b. `POST {apiUrl}/chat` with `{ message: text, source: "voice", conversationId }`. Read `data.conversationId` from the response and store it for subsequent turns.
   c. Register a one-shot listener on the WS stream for the run: capture the `messageId` from the next `message_started`, then resolve with `{ narration: message_done.content, widgets: [] }` on the matching `message_done`. `message_done.content` is the authoritative final text; for voice-only we do NOT need to accumulate `message_delta`s (they exist for live-text display, which is out of scope). We bind by `messageId` only so the correct `message_done` resolves the promise.
   d. **Widgets are always `[]`** — the backend emits no widget events (documented dormancy).
3. **Correlation.** The voice FSM issues exactly one `converse` at a time (it only calls it in `processing` state), so a single "active run" listener is sufficient. Bind to the first `message_started` seen after the POST resolves, then track its `messageId`.

### Error, timeout, and approval handling

The `converse` promise must never hang (the FSM would stay stuck in `processing`):
- **`error` event** while awaiting → reject. The FSM's `converseFailed` returns to `listening`.
- **Timeout** (no `message_done` within `RESPONSE_TIMEOUT_MS`, default 30000) → reject.
- **`message_done.cancelled === true`** → resolve with whatever text arrived, or reject if empty (treat as failure).
- **`approval_requested` event** → the local env has Composio **enabled** with write actions gated behind approval (`COMPOSIO_READ_ONLY_MODE=false`, `REQUIRE_APPROVAL=true`), so approvals **will** fire whenever the user asks for a write (create Notion task, send email, create calendar event). Approval UX is deferred to iteration 2, so this iteration handles them **gracefully and audibly**, never leaving the promise or the server hanging:
  1. Send an `approval_decision` over the WS (`{ approvalId, approved: false, reason: "approvals not wired in HUD yet" }`) to release the backend's pending approval immediately (otherwise it sits until `APPROVAL_TIMEOUT_MS`, 5 min).
  2. Resolve `converse` with a **canned narration** — e.g. "Todavía no puedo ejecutar acciones que requieren aprobación; eso llega en la próxima versión." — so the HUD speaks the reason and returns to `listening` (rather than failing silently). Reads are unaffected and complete normally via `message_done`.
- **POST /chat failure** (non-2xx / network) → reject.

### Configuration

- Read `import.meta.env.VITE_API_URL` (default `http://localhost:4000`) and `VITE_WS_URL` (default `ws://localhost:4000/ws`). These are already documented in `apps/hud/.env.example`.
- Remove the old `BASE`/`/converse` logic. Delete `apps/hud/src/api/converse.ts` and its test `apps/hud/src/api/converse.test.ts` (replaced by `agentClient` + its tests).

### Shared contract types

Add `@wattson/shared` as a dependency of `@wattson/hud` (`workspace:*`) and import `AgentEvent`, `AgentStatus`, and the chat request/response types from it — single source of truth for the protocol. (`packages/shared` is types-first; this coupling is intentional and cheap.)

### Files

- **Create** `apps/hud/src/api/agentClient.ts` — the factory above.
- **Create** `apps/hud/src/api/agentClient.test.ts` — unit tests with a fake `fetch` and a fake WebSocket.
- **Modify** `apps/hud/src/App.tsx` — replace `converse: (text) => callConverse(text)` with an `agentClient` instance created once (stable ref) and `converse: agentClient.converse`.
- **Modify** `apps/hud/package.json` — add `"@wattson/shared": "workspace:*"`.
- **Delete** `apps/hud/src/api/converse.ts` and `apps/hud/src/api/converse.test.ts`.

The FSM (`sessionMachine.ts`), `useSession.ts`, TTS/STT/wake adapters, and widget components are **unchanged**.

## Testing

- **`agentClient.test.ts`** (Vitest), driving a fake `fetch` (resolves `{ ok, data: { conversationId, runId } }`) and a fake `WebSocket` that lets the test emit events:
  - Happy path: emit `message_started → message_delta("Hola") → message_delta(" Luciano") → message_done(content="Hola Luciano")`; assert `converse` resolves `{ narration: "Hola Luciano", widgets: [] }`.
  - `conversationId` is sent on the second `converse` call after being learned from the first response.
  - `error` event → promise rejects.
  - Timeout (no `message_done`) → promise rejects (use fake timers).
  - `approval_requested` mid-run → the client sends an `approval_decision { approved: false }` over the (fake) WS AND resolves with the canned narration (NOT a rejection); assert both the WS message was sent and the resolved narration text.
  - Two sequential `converse` calls don't cross-wire (second run binds to its own `message_started`).
- The existing FSM suite (37/37) stays green — it uses a fake `converse` and is untouched.
- No live backend is required for tests.

## Out of scope (future iterations)

- Visual surfacing: streaming text in captions, tool-call timeline, chat panel.
- Approvals UX (voice or visual) and any write/send/delete actions.
- Incremental (sentence-by-sentence) speech; we speak the full reply on `message_done`.
- Widget rendering from backend events.
- Backend cloud hosting and setting `VITE_API_URL`/`VITE_WS_URL` in Vercel (deploy step).
- `cancel_generation` on barge-in (the FSM already stops TTS locally; cancelling the server run is a nice-to-have later).

## Success criteria

Running the backend locally (`pnpm dev:api`) with the default mock provider and the HUD (`pnpm --filter @wattson/hud dev`) with `VITE_API_URL`/`VITE_WS_URL` pointing at it: saying the wake word, speaking a query, and having the HUD speak back the agent's real streamed reply. `agentClient` unit tests pass; existing HUD suite stays 37/37.
