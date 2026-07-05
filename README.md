# Wattson

Wattson is a Jarvis-style AI agent. It has an engine and a face: **`apps/api`** (a Fastify
agent backend, plus the shared **`packages/*`** libraries it depends on — `agent-core`,
`memory`, `shared`, `skills`, `voice`) does the reasoning, tool calls, and streaming; **`apps/hud`**
is the interface — our voice-reactive holographic HUD, and the thing that gets deployed to
Vercel. **`apps/web`** is a reference React client (used as the wiring blueprint for chat +
WebSocket event consumption) and **`apps/desktop`** is a Tauri shell wrapping the web client
for a native desktop build.

This is a pnpm + Turborepo monorepo.

## Local dev

```bash
pnpm install

# Backend (Fastify, http://localhost:4000)
cp .env.example .env   # defaults use mock providers — no secrets needed to boot
pnpm dev:api

# HUD (Vite + React 19)
pnpm --filter @wattson/hud dev

# DB (Prisma, via @wattson/memory)
pnpm db:generate
```

Other useful scripts: `pnpm dev:web` (reference web client), `pnpm dev:desktop` (Tauri shell +
api + web together), `pnpm typecheck` / `pnpm lint` (Turborepo-orchestrated across all
packages), `pnpm db:migrate`, `pnpm db:studio`.

## Deployment

The backend (`apps/api`) does **not** deploy to Vercel — it's a persistent Fastify process
with a WebSocket server and a local SQLite database (via Prisma), which doesn't fit Vercel's
serverless model. It needs to run somewhere long-lived (a VM, container, etc.).

Vercel only builds and deploys **`apps/hud`** (see `vercel.json`). The HUD talks to the
backend over HTTP/WebSocket using `VITE_API_URL` / `VITE_WS_URL` — see
`apps/hud/.env.example` — so it can point at wherever the backend is actually running.

## Provenance

The agent backend (`apps/api`, `apps/web`, `apps/desktop`, `packages/*`) was imported from
[`AceleraTalent/Jarvis_mvp`](https://github.com/AceleraTalent/Jarvis_mvp) at commit `ddc6adb`
and rebranded from Jarvis to Wattson. See `docs/backend/README-import.md` for details. The HUD
(`apps/hud`) is original work from this repo.
