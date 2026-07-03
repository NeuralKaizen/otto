# Wattson Monorepo Adoption — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repo (currently a Vite HUD + Python FastAPI mock) into a single pnpm/turbo monorepo whose base is our colleague's Fastify agent backend (`AceleraTalent/Jarvis_mvp`), rebranded end-to-end as **Wattson**, with our HUD living inside it as `apps/hud` and deploying to Vercel.

**Architecture:** Adopt the colleague's monorepo working tree (`apps/*`, `packages/*`, turbo/pnpm config) as the skeleton. Drop the Python `backend/`. Move our HUD into `apps/hud`. The backend is the engine ("how it operates"); the HUD is the interface. Backend runs locally for now (persistent Fastify + WebSocket + SQLite — does NOT fit Vercel serverless); only the HUD deploys to Vercel and points at the backend via env vars.

**Tech Stack:** pnpm 10 workspaces, turbo, TypeScript, Fastify + @fastify/websocket (backend), Prisma + SQLite (memory), React 19 + Vite (HUD, `apps/hud`), React 18 + Vite + Tailwind (colleague's reference web client, `apps/web`).

## Global Constraints

- **Rebrand is total.** Every `jarvis` / `otto` identifier becomes `wattson`. Specifically: npm scope `@jarvis/*` → `@wattson/*`; root package name `jarvis-os` → `wattson`; SQLite file `jarvis.db` → `wattson.db`; user-facing/product strings "Otto"/"Jarvis" → "Wattson" (preserve casing: `Jarvis`→`Wattson`, `jarvis`→`wattson`, `JARVIS`→`WATTSON`). Do NOT rename third-party identifiers that merely contain the substring (there are none known; verify before sed).
- **Do not bring the colleague's `.git`.** This is a one-time import of his working tree. Credit the source commit (`AceleraTalent/Jarvis_mvp@ddc6adb`) in the import commit message and README.
- **Preserve our repo's `.git`, `.vercel`, and `docs/`.** The GitHub remote stays `git@github.com:NeuralKaizen/otto.git` and the Vercel link stays intact.
- **Package manager:** system `pnpm` is 10.32; the imported root `package.json` pins `packageManager: pnpm@9.0.0`. Bump it to `pnpm@10.32.1` so local installs don't warn/fail. Node is v26.
- **The HUD↔protocol wiring is OUT OF SCOPE for this plan.** After Plan A the HUD builds and deploys but still calls the old `/converse` endpoint (dead). Rewiring the HUD to `POST /chat` + the `AgentEvent` WebSocket stream is **Plan B**, written against live code once this monorepo exists. Do not attempt it here.
- **Widgets have no backend source.** The colleague's backend emits streaming text + tool calls + approvals, never `widgets`. Leave the HUD widget system in place but dormant; document it as a follow-up.
- **Source working tree location (read-only reference):** `/tmp/claude-1000/-home-newral-Lucianos-otto/b29fbaad-ef04-454f-9661-7214bc3bb9b4/scratchpad/jarvis_mvp`. Referred to below as `$SRC`.

---

## File Structure (target state after Plan A)

```
otto/                         (repo unchanged; GitHub remote NeuralKaizen/otto)
  apps/
    api/        (@wattson/api    — Fastify agent server, from colleague)
    web/        (@wattson/web    — colleague's reference React client; kept as protocol reference)
    desktop/    (@wattson/desktop— Tauri shell; left intact, not our concern)
    hud/        (@wattson/hud    — OUR HUD, moved from ./frontend)
  packages/
    agent-core/ (@wattson/agent-core)
    memory/     (@wattson/memory — Prisma + SQLite)
    skills/     (@wattson/skills)
    voice/      (@wattson/voice)
    shared/     (@wattson/shared — AgentEvent/AgentStatus contract)
  docs/
    <our existing docs unchanged>
    backend/    (colleague's docs: architecture.md, roadmap.md, ...)
    superpowers/plans/2026-07-02-wattson-monorepo.md   (this file)
  package.json          (name: "wattson", from colleague's jarvis-os)
  pnpm-workspace.yaml   (apps/* + packages/*)
  turbo.json
  tsconfig.base.json
  .env.example          (merged; Wattson-branded)
  .gitignore            (merged)
  vercel.json           (REWRITTEN — builds apps/hud only)
  README.md             (updated; credits source)
  (DELETED: ./backend  — Python FastAPI mock)
```

Note: `./frontend` is untouched during Phase 1–2 (it is not matched by the `apps/*|packages/*` workspace globs, so pnpm ignores it). It is moved to `apps/hud` in Phase 3.

---

## Task 1: Branch + baseline snapshot

**Files:** none created; git branch only.

- [ ] **Step 1: Confirm working tree is committed or stashed**

Run: `git -C /home/newral/Lucianos/otto status --porcelain`
Expected: note any dirty files. The current branch already has uncommitted HUD work (`App.tsx`, new `hud/*` files). Commit it first so the migration starts from a clean base.

```bash
cd /home/newral/Lucianos/otto
git add -A && git commit -m "chore(hud): snapshot HUD WIP before Wattson monorepo migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Create the migration branch**

```bash
git checkout -b feat/wattson-monorepo
```

- [ ] **Step 3: Record the current HUD test baseline**

Run: `cd /home/newral/Lucianos/otto/frontend && npm ci && npm test`
Expected: tests PASS. Record the passing count — Phase 3 must keep these green after the move.

- [ ] **Step 4: Commit the branch point (no-op marker)**

```bash
cd /home/newral/Lucianos/otto
git commit --allow-empty -m "chore: start Wattson monorepo migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Import the colleague's monorepo working tree

**Files:**
- Create: `apps/api/`, `apps/web/`, `apps/desktop/`, `packages/*/` (copied from `$SRC`)
- Create: `turbo.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `docs/backend/*`
- Modify: `package.json` (replaced by colleague's, then pnpm pin bumped), `.gitignore` (merged), `.env.example` (created from `$SRC/.env.example`)
- Delete: `backend/` (Python FastAPI mock)

**Interfaces:**
- Produces: a pnpm workspace rooted at repo root with members `apps/*` and `packages/*`; root `package.json` name `wattson` (renamed in Task 4); backend entrypoint `apps/api/src/server.ts` listening on `API_PORT` (default 4000) with WebSocket at `/ws`.

- [ ] **Step 1: Copy apps, packages, and root config from `$SRC` (excluding git/node_modules/build/db)**

```bash
cd /home/newral/Lucianos/otto
SRC=/tmp/claude-1000/-home-newral-Lucianos-otto/b29fbaad-ef04-454f-9661-7214bc3bb9b4/scratchpad/jarvis_mvp
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='.venv' --exclude='*.db' --exclude='.turbo' \
  "$SRC/apps" "$SRC/packages" .
cp "$SRC/turbo.json" "$SRC/pnpm-workspace.yaml" "$SRC/pnpm-lock.yaml" \
   "$SRC/tsconfig.base.json" "$SRC/package.json" .
```

- [ ] **Step 2: Merge `.gitignore` and import the env template + backend docs**

```bash
cd /home/newral/Lucianos/otto
SRC=/tmp/claude-1000/-home-newral-Lucianos-otto/b29fbaad-ef04-454f-9661-7214bc3bb9b4/scratchpad/jarvis_mvp
# Append colleague's ignore rules that we don't already have (dedup after).
printf '\n# --- from Wattson backend ---\ndist/\n.turbo/\n*.db\n.env\n' >> .gitignore
cp "$SRC/.env.example" .env.example
mkdir -p docs/backend && cp "$SRC"/docs/*.md docs/backend/
```

- [ ] **Step 3: Delete the Python backend and its Vercel service wiring**

```bash
cd /home/newral/Lucianos/otto
git rm -r --cached backend >/dev/null 2>&1 || true
rm -rf backend
```

(`vercel.json` is rewritten in Task 8, not now — leaving it temporarily broken is fine; nothing builds from it until then.)

- [ ] **Step 4: Bump the pnpm pin to match the local toolchain**

Modify `package.json`: change `"packageManager": "pnpm@9.0.0"` to `"packageManager": "pnpm@10.32.1"`.

- [ ] **Step 5: Verify the tree is coherent (no install yet)**

Run: `cd /home/newral/Lucianos/otto && cat pnpm-workspace.yaml && ls apps packages`
Expected: workspace globs `apps/*` + `packages/*`; `apps/` shows `api web desktop`; `packages/` shows `agent-core memory shared skills voice`.

- [ ] **Step 6: Commit the import**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "feat: import Wattson agent backend monorepo (from AceleraTalent/Jarvis_mvp@ddc6adb)

Adopts colleague's Fastify agent backend as the base of this repo.
Drops the Python FastAPI mock backend. HUD move + rebrand follow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Boot the backend workspace (install, db, typecheck, tests)

**Files:** none (verification task); may create `.env` locally (gitignored) and `packages/memory` Prisma client + `wattson.db` (gitignored).

**Interfaces:**
- Consumes: workspace from Task 2.
- Produces: a locally-runnable backend proving the import is intact, before we rename anything.

- [ ] **Step 1: Install workspace dependencies**

Run: `cd /home/newral/Lucianos/otto && pnpm install`
Expected: resolves all workspace packages, no missing-dependency errors. If `packageManager` triggers a corepack error, confirm Step 4 of Task 2 set `pnpm@10.32.1`.

- [ ] **Step 2: Create local `.env` from the template**

```bash
cd /home/newral/Lucianos/otto
cp .env.example .env
```

Defaults are mock providers (`LLM_PROVIDER=mock`, `VOICE_PROVIDER=mock`, all integrations disabled) so no secrets are needed to boot.

- [ ] **Step 3: Generate the Prisma client and DB**

Run: `cd /home/newral/Lucianos/otto && pnpm db:generate`
Expected: Prisma client generated for `@jarvis/memory` (renamed in Task 4). If a migration is required to create the SQLite file, run `pnpm db:migrate`.

- [ ] **Step 4: Typecheck the whole workspace**

Run: `cd /home/newral/Lucianos/otto && pnpm typecheck`
Expected: PASS across all packages. Record any failures — they must be from environment, not our edits (we made none yet).

- [ ] **Step 5: Run backend tests**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @jarvis/api test`
Expected: PASS (`chat.routes.test.ts`, `notion.routes.test.ts`). These are the colleague's tests proving the import works.

- [ ] **Step 6: Smoke-boot the API**

Run: `cd /home/newral/Lucianos/otto && pnpm dev:api` (background), then `curl -s http://localhost:4000/health`
Expected: a JSON health response. Stop the dev server after confirming.

- [ ] **Step 7: Commit the verified baseline**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "chore: verify Wattson backend boots in-workspace (install, prisma, typecheck, tests, health)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rebrand `@jarvis/*` and `jarvis` → Wattson (backend side)

**Files:** all package.json `name`/`dependencies` under `apps/{api,web,desktop}` and `packages/*`; every `.ts`/`.tsx` importing `@jarvis/*`; root `package.json` scripts referencing `@jarvis/*`; `packages/memory/prisma/schema.prisma` + `.env.example` (`jarvis.db` → `wattson.db`); backend docs strings.

**Interfaces:**
- Consumes: verified workspace from Task 3.
- Produces: identical workspace with all internal identifiers under the `@wattson/*` scope and product name Wattson. Import specifiers change from `@jarvis/x` to `@wattson/x` everywhere.

- [ ] **Step 1: Rename the npm scope and package names across all manifests and sources**

```bash
cd /home/newral/Lucianos/otto
# Scope in imports and manifests (apps + packages + root scripts):
grep -rl '@jarvis/' apps packages package.json --include='*.ts' --include='*.tsx' --include='*.json' \
  | xargs sed -i 's#@jarvis/#@wattson/#g'
# Root package name:
sed -i 's/"name": "jarvis-os"/"name": "wattson"/' package.json
```

- [ ] **Step 2: Rename the DB file and remaining `jarvis` product strings**

```bash
cd /home/newral/Lucianos/otto
sed -i 's/jarvis\.db/wattson.db/g' .env.example packages/memory/prisma/schema.prisma
# Case-preserving product-name pass over source + backend docs (NOT node_modules/dist):
grep -rl -i 'jarvis' apps packages docs/backend --include='*.ts' --include='*.tsx' --include='*.md' --include='*.css' \
  | xargs sed -i -e 's/Jarvis/Wattson/g' -e 's/jarvis/wattson/g' -e 's/JARVIS/WATTSON/g'
```

- [ ] **Step 2b: Manually review component/dir names carrying the brand**

Check for `JarvisOrb.tsx`, `components/jarvis/` in `apps/web`. Rename files/dirs and their imports:

```bash
cd /home/newral/Lucianos/otto/apps/web/src/components
git mv jarvis wattson 2>/dev/null || (mv jarvis wattson)
git mv wattson/JarvisOrb.tsx wattson/WattsonOrb.tsx 2>/dev/null || (mv wattson/JarvisOrb.tsx wattson/WattsonOrb.tsx)
# Fix imports of the renamed symbol/paths:
cd /home/newral/Lucianos/otto
grep -rl 'JarvisOrb\|components/jarvis' apps/web/src | xargs sed -i -e 's/JarvisOrb/WattsonOrb/g' -e 's#components/jarvis#components/wattson#g'
```

- [ ] **Step 3: Reinstall so the workspace relinks under the new scope**

Run: `cd /home/newral/Lucianos/otto && pnpm install`
Expected: workspace resolves `@wattson/*` links with no unresolved `@jarvis/*` references.

- [ ] **Step 4: Verify nothing references the old scope or name**

Run: `cd /home/newral/Lucianos/otto && grep -rn '@jarvis/\|jarvis-os\|jarvis\.db' apps packages package.json --include='*.ts' --include='*.tsx' --include='*.json' --include='*.prisma'`
Expected: NO output.

- [ ] **Step 5: Re-run typecheck and backend tests**

Run: `cd /home/newral/Lucianos/otto && pnpm typecheck && pnpm --filter @wattson/api test`
Expected: PASS — same result as Task 3, now under the Wattson scope.

- [ ] **Step 6: Commit the backend rebrand**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "refactor: rebrand backend Jarvis -> Wattson (@wattson scope, wattson.db, strings)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Move the HUD into `apps/hud`

**Files:**
- Move: `frontend/*` → `apps/hud/*`
- Modify: `apps/hud/package.json` (`name` → `@wattson/hud`), `apps/hud/tsconfig*.json` if they reference paths, `apps/hud/vite.config.ts` if present.

**Interfaces:**
- Consumes: rebranded workspace from Task 4.
- Produces: `@wattson/hud` app building under pnpm/turbo with its existing tests green.

- [ ] **Step 1: Move the HUD into the workspace**

```bash
cd /home/newral/Lucianos/otto
git mv frontend apps/hud
```

- [ ] **Step 2: Rename the HUD package**

Modify `apps/hud/package.json`: change `"name": "frontend"` to `"name": "@wattson/hud"`. Keep its own React 19 / Vite 8 versions (independent from `apps/web`).

- [ ] **Step 3: Install so the HUD joins the workspace**

Run: `cd /home/newral/Lucianos/otto && pnpm install`
Expected: `@wattson/hud` appears as a workspace member (matched by `apps/*`).

- [ ] **Step 4: Build and test the HUD in-workspace**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud build`
Expected: the same test count as the Task 1 baseline PASSES; build emits `apps/hud/dist`.

- [ ] **Step 5: Commit the move**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "refactor: move HUD into apps/hud (@wattson/hud) as the Wattson interface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rebrand the HUD Otto → Wattson

**Files:** `apps/hud/src/**` strings and filenames (e.g. `hud/scene/OttoScene.tsx`), `apps/hud/index.html` `<title>`, any "otto" in tests/copy.

**Interfaces:**
- Consumes: `@wattson/hud` from Task 5.
- Produces: HUD with all Otto branding replaced by Wattson; tests still green (voice tests reference `"hola otto"` → `"hola wattson"`).

- [ ] **Step 1: Rename the Otto-branded component file and its imports**

```bash
cd /home/newral/Lucianos/otto/apps/hud/src/hud/scene
git mv OttoScene.tsx WattsonScene.tsx
cd /home/newral/Lucianos/otto
grep -rl 'OttoScene' apps/hud/src | xargs sed -i 's/OttoScene/WattsonScene/g'
```

- [ ] **Step 2: Case-preserving Otto → Wattson pass over HUD source + index.html**

```bash
cd /home/newral/Lucianos/otto
grep -rl -i 'otto' apps/hud/src apps/hud/index.html \
  | xargs sed -i -e 's/Otto/Wattson/g' -e 's/otto/wattson/g' -e 's/OTTO/WATTSON/g'
```

Note: this also updates the wake-word / closing-phrase test fixtures (`sessionMachine.test.ts`, `useSession.test.ts`). That is intended — the assistant is now "Wattson".

- [ ] **Step 3: Verify no Otto branding remains in the HUD**

Run: `cd /home/newral/Lucianos/otto && grep -rni 'otto' apps/hud/src apps/hud/index.html`
Expected: NO output (or only unrelated substrings like "bottom" — inspect; there should be none).

- [ ] **Step 4: Re-run HUD tests and build**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud build`
Expected: PASS + successful build.

- [ ] **Step 5: Commit the HUD rebrand**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "refactor(hud): rebrand Otto -> Wattson (wake word, scene, copy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rewrite Vercel config to deploy only the HUD

**Files:**
- Modify: `vercel.json` (replace the two-service Python+Vite config with a single HUD build)
- Create: `apps/hud/.env.example` (documents `VITE_API_URL`, `VITE_WS_URL`)

**Interfaces:**
- Consumes: `@wattson/hud` build from Task 6.
- Produces: a Vercel config that builds `apps/hud` from the monorepo root using pnpm; backend is NOT deployed by Vercel.

- [ ] **Step 1: Replace `vercel.json`**

Overwrite `/home/newral/Lucianos/otto/vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm install --frozen-lockfile=false && pnpm --filter @wattson/hud build",
  "outputDirectory": "apps/hud/dist",
  "framework": "vite"
}
```

Rationale: the persistent Fastify + WebSocket + SQLite backend cannot run on Vercel serverless, so it is removed from the deploy. The HUD reads the backend URL at runtime from `VITE_API_URL` / `VITE_WS_URL` (set in Vercel project env, pointing at the local/cloud backend — decided in Plan B/deploy).

- [ ] **Step 2: Document the HUD's runtime env**

Create `apps/hud/.env.example`:

```
# URL of the Wattson backend (Fastify). Local dev default:
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000/ws
```

- [ ] **Step 3: Verify the exact Vercel build command works locally**

Run: `cd /home/newral/Lucianos/otto && pnpm install --frozen-lockfile=false && pnpm --filter @wattson/hud build`
Expected: `apps/hud/dist` produced with no error — this is byte-for-byte what Vercel will run.

- [ ] **Step 4: Commit the deploy config**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "build: Vercel deploys apps/hud only; backend runs off-Vercel (env-driven URLs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: README + provenance + final verification

**Files:**
- Modify: `README.md` (describe the Wattson monorepo, credit the source, document run commands)
- Create: `docs/backend/README-import.md` (one-paragraph provenance note)

**Interfaces:**
- Consumes: everything above.
- Produces: a documented, fully-verified branch ready to push and open a PR.

- [ ] **Step 1: Update `README.md`**

Rewrite the top of `README.md` to describe: Wattson = agent backend (`apps/api` + `packages/*`) + HUD interface (`apps/hud`) + reference web client (`apps/web`) + desktop shell (`apps/desktop`); local dev commands (`pnpm dev:api`, `pnpm --filter @wattson/hud dev`); note the backend is not on Vercel. Credit `AceleraTalent/Jarvis_mvp@ddc6adb` as the backend origin.

- [ ] **Step 2: Full-workspace verification**

Run: `cd /home/newral/Lucianos/otto && pnpm install && pnpm typecheck && pnpm --filter @wattson/api test && pnpm --filter @wattson/hud test`
Expected: all PASS.

- [ ] **Step 3: Confirm no stale brand references anywhere in source**

Run: `cd /home/newral/Lucianos/otto && grep -rni 'jarvis\|\botto\b' apps packages --include='*.ts' --include='*.tsx' --include='*.json' | grep -vi node_modules`
Expected: NO output.

- [ ] **Step 4: Commit and push the branch**

```bash
cd /home/newral/Lucianos/otto
git add -A
git commit -m "docs: Wattson monorepo README + provenance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/wattson-monorepo
```

- [ ] **Step 5: Open a PR (do not merge — human review)**

```bash
gh pr create --title "Wattson: adopt agent backend monorepo + HUD as apps/hud" \
  --body "Restructures the repo into a pnpm/turbo monorepo with the Wattson agent backend as the base and the HUD as apps/hud. Rebrands Jarvis/Otto -> Wattson. Vercel builds the HUD only; backend runs off-Vercel. HUD<->protocol wiring is a follow-up (Plan B).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## After Plan A: what's NOT done (→ Plan B)

- The HUD still calls the dead `POST /converse` (`apps/hud/src/api/converse.ts`). Plan B ports `apps/web/src/lib/api.ts` (`sendChat` → `POST /chat`) and `apps/web/src/hooks/useAgentSocket.ts` (WebSocket consumer of the `AgentEvent` stream) into the HUD, and adapts `apps/hud/src/voice/useSession.ts` + `sessionMachine.ts` to drive a chat run and speak the streamed narration.
- The `AgentEvent` contract lives in `@wattson/shared` (`events.ts`): `status | intent_detected | plan_created | message_started | message_delta | message_done | tool_call_started | tool_call_completed | approval_requested | approval_resolved | error`.
- Widget rendering (`apps/hud/src/hud/widgets/*`) has no backend event source; stays dormant until the backend emits a widget/render event. Documented, not wired.
- Backend production hosting (persistent Node host + Postgres instead of SQLite) — deferred; local backend for now.

## Self-Review

- **Spec coverage:** adopt-monorepo (Tasks 2–3), rebrand to Wattson (Tasks 4, 6), HUD as interface (Task 5), single-repo (whole plan), deploy reality/off-Vercel backend (Task 7). HUD↔protocol wiring explicitly deferred to Plan B with the exact reference files named. ✅
- **Placeholder scan:** rename steps use concrete `sed`/`grep` commands; verification steps have exact commands + expected output. The README rewrite (Task 8 Step 1) and vercel.json are shown concretely. ✅
- **Type/name consistency:** scope `@wattson/*` used consistently after Task 4; HUD package `@wattson/hud`; filter commands use the post-rename names in tasks that run after the rename. DB `wattson.db`; WS path `/ws`; ports 4000 (api). ✅
