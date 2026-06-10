# Otto — Prototipo Voice HUD

Prototipo voz-reactivo (wake word "Otto" → sesión → Claude → HUD con datos mock).
Spec: `docs/superpowers/specs/2026-06-09-otto-voice-hud-design.md`.
Plan: `docs/superpowers/plans/2026-06-09-otto-voice-hud-prototype.md`.

## Backend (FastAPI)

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # cerebro Claude
uvicorn app.main:app --reload       # http://localhost:8000
pytest                              # tests
```

## Frontend (Vite + React)

```bash
cd frontend && npm install
npm run dev                         # http://localhost:5173 (usar Chrome)
npm test                            # tests (Vitest)
```

## Notas

- Datos **mock evidentes** (cartel "datos de demostración"). La capa de query real
  (Postgres) se enchufa en `backend/app/queries.py` sin tocar la UI.
- Voz fase 1: APIs nativas del navegador. Swap a Porcupine/Deepgram/Cartesia = plan siguiente.
- Decí **"Otto"** para abrir sesión, hablá, y decí **"listo"** para cerrar.
