# Backend import provenance

The backend monorepo (`apps/api`, `apps/web`, `apps/desktop`, and `packages/*` —
`agent-core`, `memory`, `shared`, `skills`, `voice`) was imported into this repository from
[`AceleraTalent/Jarvis_mvp`](https://github.com/AceleraTalent/Jarvis_mvp) at commit
`ddc6adb` on 2026-07-02, and rebranded from Jarvis to Wattson (package scope `@jarvis/*` →
`@wattson/*`, database name, and user-facing strings). It now lives and evolves in this repo
alongside `apps/hud`. The original Python/FastAPI mock backend that previously lived under
`backend/` in this repo was removed as part of the same import — it was a prototype UI mock
layer, fully superseded by the imported Fastify agent backend.
