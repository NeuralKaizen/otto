# Otto Voice HUD — Prototipo (pasos 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un prototipo voz-reactivo de Otto: wake word "Otto" → sesión de conversación → Claude devuelve `{narration, ui_spec}` → el HUD renderiza widgets con datos mock y Otto narra por voz, todo con APIs nativas del navegador (cero infra de voz).

**Architecture:** Frontend React+Vite+TS dueño de la experiencia (máquina de estados de sesión de lógica pura + adaptadores de voz swappables + HUD); backend FastAPI delgado como gateway de Claude + registro de queries mock. El LLM emite *spec de UI*; los números los pone el registro de queries (mock hoy, Postgres mañana) — respetando "dato ≠ presentación".

**Tech Stack:** Frontend: Vite, React, TypeScript, Vitest. Backend: Python, FastAPI, uvicorn, pydantic, anthropic SDK, pytest. Voz fase 1: Web Speech API + SpeechSynthesis (nativas).

**Spec:** `docs/superpowers/specs/2026-06-09-otto-voice-hud-design.md`

---

## Estructura de archivos

**Backend** (`backend/`)
- `backend/app/schemas.py` — modelos pydantic: `Widget`, `UiSpec`, `ConverseRequest`, `ConverseResponse`.
- `backend/app/queries.py` — registro de queries mock (`run_query(name) -> data`).
- `backend/app/brain.py` — adaptador de modelo (Claude) detrás de una interfaz; `FakeBrain` para tests.
- `backend/app/main.py` — app FastAPI + ruta `POST /converse`.
- `backend/tests/test_queries.py`, `backend/tests/test_converse.py`.

**Frontend** (`frontend/`)
- `frontend/src/voice/types.ts` — tipos de estado/evento + interfaces de adaptadores.
- `frontend/src/voice/sessionMachine.ts` — FSM pura: `reduce(state, event) -> {state, effects}`. El corazón.
- `frontend/src/voice/sessionMachine.test.ts` — tests de la FSM.
- `frontend/src/voice/adapters/fakes.ts` — `FakeWakeWord`/`FakeTranscriber`/`FakeSpeaker`.
- `frontend/src/voice/adapters/webSpeech.ts` — wake word + STT con Web Speech API.
- `frontend/src/voice/adapters/speechSynthesis.ts` — TTS con `SpeechSynthesis`.
- `frontend/src/voice/useSession.ts` — hook React que cablea adaptadores ↔ FSM.
- `frontend/src/api/converse.ts` — cliente de `POST /converse`.
- `frontend/src/hud/widgets/registry.ts` — registro de widgets (`type -> componente`).
- `frontend/src/hud/widgets/registry.test.ts`.
- `frontend/src/hud/widgets/KpiCard.tsx`, `TableWidget.tsx`.
- `frontend/src/hud/Canvas.tsx` — renderiza `ui_spec` → widgets.
- `frontend/src/hud/Core.tsx` — núcleo audio-reactivo (canvas 2D).
- `frontend/src/hud/Captions.tsx` — subtítulos + cartel "datos de demostración".
- `frontend/src/App.tsx` — compone todo.

---

## Task 1: Scaffold del backend FastAPI

**Files:**
- Create: `backend/requirements.txt`, `backend/app/__init__.py`, `backend/tests/__init__.py`, `backend/app/main.py`

- [ ] **Step 1: Crear el proyecto y dependencias**

```bash
mkdir -p backend/app backend/tests
cd backend
python -m venv .venv && source .venv/bin/activate
printf 'fastapi\nuvicorn\npydantic\nanthropic\npytest\nhttpx\n' > requirements.txt
pip install -r requirements.txt
touch app/__init__.py tests/__init__.py
```

- [ ] **Step 2: Escribir el test de health (falla)**

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

def test_health_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_health.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 4: Implementación mínima**

Create `backend/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="Otto Gateway")

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app backend/tests
git commit -m "feat(backend): scaffold FastAPI gateway con /health"
```

---

## Task 2: Esquemas del contrato de UI generativa

**Files:**
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_schemas.py`

- [ ] **Step 1: Escribir el test (falla)**

Create `backend/tests/test_schemas.py`:

```python
from app.schemas import Widget, UiSpec, ConverseRequest, ConverseResponse

def test_widget_roundtrip():
    w = Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")
    assert w.type == "kpi_card"
    assert w.query == "tasks_overdue"

def test_converse_response_shape():
    resp = ConverseResponse(
        narration="Tenés 3 atrasadas.",
        widgets=[Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")],
    )
    dumped = resp.model_dump()
    assert dumped["narration"] == "Tenés 3 atrasadas."
    assert dumped["widgets"][0]["query"] == "tasks_overdue"

def test_converse_request_shape():
    req = ConverseRequest(text="cuántas tareas atrasadas hay")
    assert req.text == "cuántas tareas atrasadas hay"
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_schemas.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.schemas'`

- [ ] **Step 3: Implementar los esquemas**

Create `backend/app/schemas.py`:

```python
from pydantic import BaseModel

class Widget(BaseModel):
    type: str          # "kpi_card", "table", ... (registro en el frontend)
    query: str         # nombre de query en el registro del backend
    title: str

class UiSpec(BaseModel):
    narration: str
    widgets: list[Widget]

class ConverseRequest(BaseModel):
    text: str          # transcript final del usuario

class RenderedWidget(BaseModel):
    type: str
    title: str
    data: dict | list  # datos reales bindeados desde el registro de queries

class ConverseResponse(BaseModel):
    narration: str
    widgets: list[Widget]
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_schemas.py
git commit -m "feat(backend): esquemas del contrato de UI generativa"
```

---

## Task 3: Registro de queries mock

**Files:**
- Create: `backend/app/queries.py`
- Test: `backend/tests/test_queries.py`

- [ ] **Step 1: Escribir el test (falla)**

Create `backend/tests/test_queries.py`:

```python
import pytest
from app.queries import run_query, query_exists

def test_known_query_returns_mock_data():
    assert run_query("tasks_overdue") == {"value": 3}

def test_table_query_returns_rows():
    result = run_query("tasks_by_person")
    assert isinstance(result, list)
    assert result[0]["person"] == "Persona A"

def test_unknown_query_raises():
    assert query_exists("no_existe") is False
    with pytest.raises(KeyError):
        run_query("no_existe")
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_queries.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.queries'`

- [ ] **Step 3: Implementar el registro mock**

Create `backend/app/queries.py`:

```python
"""Registro de queries. Hoy devuelve mock data de juguete EVIDENTE.
Mañana cada entrada corre SQL determinístico contra Postgres — la
interfaz run_query(name) -> data NO cambia. Esa es la costura."""

_MOCK = {
    "tasks_overdue": lambda: {"value": 3},
    "tasks_active": lambda: {"value": 12},
    "tasks_by_person": lambda: [
        {"person": "Persona A", "open": 5, "overdue": 1},
        {"person": "Persona B", "open": 4, "overdue": 2},
        {"person": "Persona C", "open": 3, "overdue": 0},
    ],
}

def query_exists(name: str) -> bool:
    return name in _MOCK

def run_query(name: str):
    if name not in _MOCK:
        raise KeyError(name)
    return _MOCK[name]()
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_queries.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/queries.py backend/tests/test_queries.py
git commit -m "feat(backend): registro de queries mock (costura a Postgres)"
```

---

## Task 4: Adaptador de cerebro (Claude) con fake para tests

**Files:**
- Create: `backend/app/brain.py`
- Test: `backend/tests/test_brain.py`

- [ ] **Step 1: Escribir el test (falla)**

Create `backend/tests/test_brain.py`:

```python
from app.brain import FakeBrain
from app.schemas import UiSpec

def test_fake_brain_returns_uispec():
    brain = FakeBrain(canned=UiSpec(
        narration="ok",
        widgets=[],
    ))
    spec = brain.compose("hola")
    assert isinstance(spec, UiSpec)
    assert spec.narration == "ok"
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_brain.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.brain'`

- [ ] **Step 3: Implementar la interfaz + FakeBrain + ClaudeBrain**

Create `backend/app/brain.py`:

```python
"""Adaptador de modelo (model gateway de OTTO_CONTEXT §7). Swappable.
La interfaz Brain.compose(text) -> UiSpec aísla al resto del cerebro concreto."""
import json
import os
from typing import Protocol
from app.schemas import UiSpec

SYSTEM_PROMPT = (
    "Sos Otto, un agente de consulta y display. Dada la pregunta del usuario, "
    "respondé SOLO con un JSON con esta forma: "
    '{"narration": "<frase corta a decir en voz>", '
    '"widgets": [{"type": "kpi_card|table", "query": "<nombre>", "title": "<titulo>"}]}. '
    "Querys disponibles: tasks_overdue, tasks_active, tasks_by_person. "
    "NUNCA inventes números en los widgets: solo elegís qué query y qué widget. "
    "No agregues texto fuera del JSON."
)

class Brain(Protocol):
    def compose(self, text: str) -> UiSpec: ...

class FakeBrain:
    """Cerebro determinístico para tests. Devuelve siempre el spec inyectado."""
    def __init__(self, canned: UiSpec):
        self._canned = canned

    def compose(self, text: str) -> UiSpec:
        return self._canned

class ClaudeBrain:
    """Cerebro real. Lee ANTHROPIC_API_KEY del entorno."""
    def __init__(self, model: str = "claude-opus-4-8"):
        from anthropic import Anthropic
        self._client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = model

    def compose(self, text: str) -> UiSpec:
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
        )
        raw = msg.content[0].text
        return UiSpec.model_validate(json.loads(raw))
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_brain.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/brain.py backend/tests/test_brain.py
git commit -m "feat(backend): adaptador de cerebro Claude (swappable) + FakeBrain"
```

---

## Task 5: Ruta `/converse` que compone spec + bindea mock data

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_converse.py`

- [ ] **Step 1: Escribir el test (falla)**

Create `backend/tests/test_converse.py`:

```python
from fastapi.testclient import TestClient
from app.main import app, set_brain
from app.brain import FakeBrain
from app.schemas import UiSpec, Widget

def test_converse_binds_real_data_to_widgets():
    set_brain(FakeBrain(canned=UiSpec(
        narration="Tenés 3 atrasadas.",
        widgets=[Widget(type="kpi_card", query="tasks_overdue", title="Atrasadas")],
    )))
    client = TestClient(app)
    resp = client.post("/converse", json={"text": "cuántas atrasadas"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["narration"] == "Tenés 3 atrasadas."
    # el dato lo pone la query, no el modelo:
    assert body["widgets"][0]["data"] == {"value": 3}
    assert body["widgets"][0]["type"] == "kpi_card"
    assert body["widgets"][0]["title"] == "Atrasadas"

def test_converse_unknown_query_renders_no_data():
    set_brain(FakeBrain(canned=UiSpec(
        narration="hmm",
        widgets=[Widget(type="kpi_card", query="no_existe", title="X")],
    )))
    client = TestClient(app)
    resp = client.post("/converse", json={"text": "algo"})
    assert resp.status_code == 200
    assert resp.json()["widgets"][0]["data"] is None
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_converse.py -v`
Expected: FAIL con `ImportError: cannot import name 'set_brain'`

- [ ] **Step 3: Implementar `/converse` en main.py**

Replace `backend/app/main.py` con:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import ConverseRequest
from app.brain import Brain
from app.queries import run_query, query_exists

app = FastAPI(title="Otto Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_brain: Brain | None = None

def set_brain(brain: Brain) -> None:
    global _brain
    _brain = brain

def get_brain() -> Brain:
    global _brain
    if _brain is None:
        from app.brain import ClaudeBrain
        _brain = ClaudeBrain()
    return _brain

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/converse")
def converse(req: ConverseRequest):
    spec = get_brain().compose(req.text)
    rendered = []
    for w in spec.widgets:
        data = run_query(w.query) if query_exists(w.query) else None
        rendered.append({"type": w.type, "title": w.title, "data": data})
    return {"narration": spec.narration, "widgets": rendered}
```

- [ ] **Step 4: Correr toda la suite del backend y verificar que pasa**

Run: `cd backend && source .venv/bin/activate && pytest -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_converse.py
git commit -m "feat(backend): /converse compone spec y bindea mock data a widgets"
```

---

## Task 6: Scaffold del frontend Vite + Vitest

**Files:**
- Create: `frontend/` (proyecto Vite), `frontend/vitest.config.ts`

- [ ] **Step 1: Crear el proyecto Vite React+TS**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configurar Vitest**

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 3: Agregar el script de test**

Modify `frontend/package.json` — agregar dentro de `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Smoke test (falla porque no hay test aún, luego pasa)**

Create `frontend/src/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd frontend && npm test`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/smoke.test.ts
git commit -m "chore(frontend): scaffold Vite React+TS + Vitest"
```

---

## Task 7: Tipos de voz e interfaces de adaptadores

**Files:**
- Create: `frontend/src/voice/types.ts`

- [ ] **Step 1: Definir tipos e interfaces**

Create `frontend/src/voice/types.ts`:

```typescript
// Estados de la sesión (OTTO_CONTEXT: máquina de estados, el corazón)
export type SessionState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking";

// Eventos que disparan transiciones (independientes del audio real)
export type SessionEvent =
  | { kind: "wakeDetected" }
  | { kind: "transcript"; text: string; final: boolean }
  | { kind: "closingPhrase" }
  | { kind: "speechEnd" }            // endpointing: el usuario terminó de hablar
  | { kind: "bargeIn" }             // el usuario habla mientras Otto habla
  | { kind: "response"; narration: string; widgets: RenderedWidget[] }
  | { kind: "ttsEnd" }
  | { kind: "timeout" };            // silencio largo de seguridad

export interface RenderedWidget {
  type: string;
  title: string;
  data: unknown;
}

// Efectos que la FSM le pide al mundo exterior (la FSM no toca audio)
export type Effect =
  | { kind: "startListening" }
  | { kind: "stopListening" }
  | { kind: "callConverse"; text: string }
  | { kind: "speak"; text: string }
  | { kind: "stopSpeaking" }
  | { kind: "render"; widgets: RenderedWidget[] }
  | { kind: "armSilenceTimer" }
  | { kind: "disarmSilenceTimer" };

// --- Interfaces de adaptadores swappables ---
export interface WakeWordDetector {
  start(onWake: () => void): void;
  stop(): void;
}

export interface Transcriber {
  start(onPartial: (text: string) => void, onFinal: (text: string) => void): void;
  stop(): void;
}

export interface Speaker {
  speak(text: string, onEnd: () => void): void;
  stop(): void; // idempotente
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/voice/types.ts
git commit -m "feat(frontend): tipos de estado/evento/efecto e interfaces de adaptadores"
```

---

## Task 8: La máquina de estados de sesión (TDD, el corazón)

**Files:**
- Create: `frontend/src/voice/sessionMachine.ts`
- Test: `frontend/src/voice/sessionMachine.test.ts`

- [ ] **Step 1: Escribir los tests de transición (fallan)**

Create `frontend/src/voice/sessionMachine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reduce, initialState } from "./sessionMachine";
import type { RenderedWidget } from "./types";

const widgets: RenderedWidget[] = [{ type: "kpi_card", title: "X", data: { value: 1 } }];

describe("sessionMachine", () => {
  it("idle + wakeDetected -> listening, empieza a escuchar", () => {
    const r = reduce(initialState, { kind: "wakeDetected" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
    expect(r.effects).toContainEqual({ kind: "armSilenceTimer" });
  });

  it("listening + closingPhrase -> idle, deja de escuchar", () => {
    const r = reduce("listening", { kind: "closingPhrase" });
    expect(r.state).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("listening + speechEnd con transcript -> processing, llama converse", () => {
    let s = reduce("listening", { kind: "transcript", text: "hola otto", final: true }).state;
    const r = reduce(s, { kind: "speechEnd" });
    expect(r.state).toBe("processing");
    expect(r.effects).toContainEqual({ kind: "callConverse", text: "hola otto" });
  });

  it("processing + response -> speaking, renderiza y habla", () => {
    const r = reduce("processing", { kind: "response", narration: "tres", widgets });
    expect(r.state).toBe("speaking");
    expect(r.effects).toContainEqual({ kind: "render", widgets });
    expect(r.effects).toContainEqual({ kind: "speak", text: "tres" });
  });

  it("speaking + bargeIn -> listening, corta el TTS", () => {
    const r = reduce("speaking", { kind: "bargeIn" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "stopSpeaking" });
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("speaking + ttsEnd -> listening (la sesión sigue)", () => {
    const r = reduce("speaking", { kind: "ttsEnd" });
    expect(r.state).toBe("listening");
    expect(r.effects).toContainEqual({ kind: "startListening" });
  });

  it("listening + timeout -> idle (red de seguridad)", () => {
    const r = reduce("listening", { kind: "timeout" });
    expect(r.state).toBe("idle");
    expect(r.effects).toContainEqual({ kind: "stopListening" });
  });

  it("idle ignora transcript (no hay sesión abierta)", () => {
    const r = reduce("idle", { kind: "transcript", text: "ruido", final: true });
    expect(r.state).toBe("idle");
    expect(r.effects).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npm test -- sessionMachine`
Expected: FAIL (no existe `./sessionMachine`)

- [ ] **Step 3: Implementar la FSM**

Create `frontend/src/voice/sessionMachine.ts`:

```typescript
import type { SessionState, SessionEvent, Effect } from "./types";

export const initialState: SessionState = "idle";

interface Reduction {
  state: SessionState;
  effects: Effect[];
}

// El último transcript final visto en la sesión actual (lo necesita speechEnd).
let lastFinalTranscript = "";

export function reduce(state: SessionState, event: SessionEvent): Reduction {
  switch (state) {
    case "idle":
      if (event.kind === "wakeDetected") {
        lastFinalTranscript = "";
        return {
          state: "listening",
          effects: [{ kind: "startListening" }, { kind: "armSilenceTimer" }],
        };
      }
      return { state, effects: [] };

    case "listening":
      if (event.kind === "closingPhrase" || event.kind === "timeout") {
        return {
          state: "idle",
          effects: [{ kind: "stopListening" }, { kind: "disarmSilenceTimer" }],
        };
      }
      if (event.kind === "transcript" && event.final) {
        lastFinalTranscript = event.text;
        return { state, effects: [{ kind: "armSilenceTimer" }] };
      }
      if (event.kind === "speechEnd" && lastFinalTranscript) {
        return {
          state: "processing",
          effects: [
            { kind: "stopListening" },
            { kind: "disarmSilenceTimer" },
            { kind: "callConverse", text: lastFinalTranscript },
          ],
        };
      }
      return { state, effects: [] };

    case "processing":
      if (event.kind === "response") {
        return {
          state: "speaking",
          effects: [
            { kind: "render", widgets: event.widgets },
            { kind: "speak", text: event.narration },
          ],
        };
      }
      return { state, effects: [] };

    case "speaking":
      if (event.kind === "bargeIn") {
        return {
          state: "listening",
          effects: [
            { kind: "stopSpeaking" },
            { kind: "startListening" },
            { kind: "armSilenceTimer" },
          ],
        };
      }
      if (event.kind === "ttsEnd") {
        return {
          state: "listening",
          effects: [{ kind: "startListening" }, { kind: "armSilenceTimer" }],
        };
      }
      return { state, effects: [] };
  }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd frontend && npm test -- sessionMachine`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/voice/sessionMachine.ts frontend/src/voice/sessionMachine.test.ts
git commit -m "feat(frontend): máquina de estados de sesión (FSM pura) con tests"
```

---

## Task 9: Adaptadores fake para manejar la FSM en tests/dev

**Files:**
- Create: `frontend/src/voice/adapters/fakes.ts`
- Test: `frontend/src/voice/adapters/fakes.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Create `frontend/src/voice/adapters/fakes.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { FakeWakeWord, FakeTranscriber, FakeSpeaker } from "./fakes";

describe("fake adapters", () => {
  it("FakeWakeWord dispara onWake cuando se invoca trigger()", () => {
    const w = new FakeWakeWord();
    const onWake = vi.fn();
    w.start(onWake);
    w.trigger();
    expect(onWake).toHaveBeenCalledOnce();
  });

  it("FakeTranscriber emite parcial y final", () => {
    const t = new FakeTranscriber();
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    t.start(onPartial, onFinal);
    t.emit("hola", false);
    t.emit("hola otto", true);
    expect(onPartial).toHaveBeenCalledWith("hola");
    expect(onFinal).toHaveBeenCalledWith("hola otto");
  });

  it("FakeSpeaker llama onEnd cuando se invoca finish()", () => {
    const s = new FakeSpeaker();
    const onEnd = vi.fn();
    s.speak("tres atrasadas", onEnd);
    s.finish();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- fakes`
Expected: FAIL (no existe `./fakes`)

- [ ] **Step 3: Implementar los fakes**

Create `frontend/src/voice/adapters/fakes.ts`:

```typescript
import type { WakeWordDetector, Transcriber, Speaker } from "../types";

export class FakeWakeWord implements WakeWordDetector {
  private onWake?: () => void;
  start(onWake: () => void) { this.onWake = onWake; }
  stop() { this.onWake = undefined; }
  trigger() { this.onWake?.(); }
}

export class FakeTranscriber implements Transcriber {
  private onPartial?: (t: string) => void;
  private onFinal?: (t: string) => void;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.onPartial = onPartial;
    this.onFinal = onFinal;
  }
  stop() { this.onPartial = undefined; this.onFinal = undefined; }
  emit(text: string, final: boolean) {
    if (final) this.onFinal?.(text);
    else this.onPartial?.(text);
  }
}

export class FakeSpeaker implements Speaker {
  private onEnd?: () => void;
  speak(_text: string, onEnd: () => void) { this.onEnd = onEnd; }
  stop() { this.onEnd = undefined; }
  finish() { const cb = this.onEnd; this.onEnd = undefined; cb?.(); }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- fakes`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/voice/adapters/fakes.ts frontend/src/voice/adapters/fakes.test.ts
git commit -m "feat(frontend): adaptadores fake (wake/STT/TTS) para tests y dev"
```

---

## Task 10: Cliente HTTP de `/converse`

**Files:**
- Create: `frontend/src/api/converse.ts`
- Test: `frontend/src/api/converse.test.ts`

- [ ] **Step 1: Escribir el test (falla)**

Create `frontend/src/api/converse.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { callConverse } from "./converse";

afterEach(() => vi.restoreAllMocks());

describe("callConverse", () => {
  it("postea el texto y devuelve narration + widgets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        narration: "tres",
        widgets: [{ type: "kpi_card", title: "X", data: { value: 3 } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callConverse("cuántas atrasadas");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/converse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.narration).toBe("tres");
    expect(result.widgets[0].data).toEqual({ value: 3 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- converse`
Expected: FAIL (no existe `./converse`)

- [ ] **Step 3: Implementar el cliente**

Create `frontend/src/api/converse.ts`:

```typescript
import type { RenderedWidget } from "../voice/types";

const BASE = "http://localhost:8000";

export interface ConverseResult {
  narration: string;
  widgets: RenderedWidget[];
}

export async function callConverse(text: string): Promise<ConverseResult> {
  const resp = await fetch(`${BASE}/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`converse failed: ${resp.status}`);
  return (await resp.json()) as ConverseResult;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- converse`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/converse.ts frontend/src/api/converse.test.ts
git commit -m "feat(frontend): cliente HTTP de /converse"
```

---

## Task 11: Registro y componentes de widgets

**Files:**
- Create: `frontend/src/hud/widgets/KpiCard.tsx`, `frontend/src/hud/widgets/TableWidget.tsx`, `frontend/src/hud/widgets/registry.tsx`
- Test: `frontend/src/hud/widgets/registry.test.tsx`

- [ ] **Step 1: Escribir el test (falla)**

Create `frontend/src/hud/widgets/registry.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { widgetFor } from "./registry";

describe("widget registry", () => {
  it("kpi_card renderiza el valor de data", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: { value: 3 } });
    render(<>{el}</>);
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("type desconocido renderiza un fallback, no rompe", () => {
    const el = widgetFor({ type: "no_existe", title: "X", data: null });
    render(<>{el}</>);
    expect(screen.getByText(/sin renderer/i)).toBeInTheDocument();
  });

  it("data null renderiza estado sin datos", () => {
    const el = widgetFor({ type: "kpi_card", title: "Atrasadas", data: null });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- registry`
Expected: FAIL (no existe `./registry`)

- [ ] **Step 3: Implementar los componentes y el registro**

Create `frontend/src/hud/widgets/KpiCard.tsx`:

```typescript
export function KpiCard({ title, data }: { title: string; data: unknown }) {
  const value = (data as { value?: number } | null)?.value;
  return (
    <div className="widget kpi-card">
      <div className="widget-title">{title}</div>
      {data == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <div className="kpi-value">{value}</div>
      )}
    </div>
  );
}
```

Create `frontend/src/hud/widgets/TableWidget.tsx`:

```typescript
export function TableWidget({ title, data }: { title: string; data: unknown }) {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  return (
    <div className="widget table-widget">
      <div className="widget-title">{title}</div>
      {rows == null ? (
        <div className="widget-empty">sin datos</div>
      ) : (
        <table>
          <thead>
            <tr>{Object.keys(rows[0] ?? {}).map((k) => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Create `frontend/src/hud/widgets/registry.tsx`:

```typescript
import type { ReactElement } from "react";
import type { RenderedWidget } from "../../voice/types";
import { KpiCard } from "./KpiCard";
import { TableWidget } from "./TableWidget";

type Renderer = (w: RenderedWidget) => ReactElement;

const REGISTRY: Record<string, Renderer> = {
  kpi_card: (w) => <KpiCard title={w.title} data={w.data} />,
  table: (w) => <TableWidget title={w.title} data={w.data} />,
};

export function widgetFor(w: RenderedWidget): ReactElement {
  const renderer = REGISTRY[w.type];
  if (!renderer) {
    return <div className="widget widget-unknown">sin renderer para "{w.type}"</div>;
  }
  return renderer(w);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- registry`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hud/widgets
git commit -m "feat(frontend): registro de widgets (kpi_card, table) con fallbacks"
```

---

## Task 12: Componentes del HUD (Canvas, Core, Captions)

**Files:**
- Create: `frontend/src/hud/Canvas.tsx`, `frontend/src/hud/Core.tsx`, `frontend/src/hud/Captions.tsx`
- Test: `frontend/src/hud/Canvas.test.tsx`

- [ ] **Step 1: Escribir el test del Canvas (falla)**

Create `frontend/src/hud/Canvas.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Canvas } from "./Canvas";

describe("Canvas", () => {
  it("renderiza un widget por cada entrada del spec", () => {
    render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "Atrasadas", data: { value: 3 } },
          { type: "kpi_card", title: "Activas", data: { value: 12 } },
        ]}
      />,
    );
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("Activas")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- Canvas`
Expected: FAIL (no existe `./Canvas`)

- [ ] **Step 3: Implementar Canvas, Core y Captions**

Create `frontend/src/hud/Canvas.tsx`:

```typescript
import type { RenderedWidget } from "../voice/types";
import { widgetFor } from "./widgets/registry";

export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  return (
    <div className="hud-canvas">
      {widgets.map((w, i) => (
        <div key={i} className="hud-slot">{widgetFor(w)}</div>
      ))}
    </div>
  );
}
```

Create `frontend/src/hud/Core.tsx`:

```typescript
import type { SessionState } from "../voice/types";

const LABEL: Record<SessionState, string> = {
  idle: "en reposo",
  listening: "escuchando",
  processing: "pensando",
  speaking: "hablando",
};

// Núcleo audio-reactivo. amplitude 0..1 escala el pulso (mic al escuchar, TTS al hablar).
export function Core({ state, amplitude }: { state: SessionState; amplitude: number }) {
  const scale = 1 + amplitude * 0.6;
  return (
    <div className={`hud-core core-${state}`} aria-label={LABEL[state]}>
      <div className="core-orb" style={{ transform: `scale(${scale})` }} />
      <div className="core-state">{LABEL[state]}</div>
    </div>
  );
}
```

Create `frontend/src/hud/Captions.tsx`:

```typescript
export function Captions({ text }: { text: string }) {
  return (
    <div className="hud-captions">
      <span className="demo-badge">datos de demostración</span>
      <span className="caption-text">{text}</span>
    </div>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- Canvas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hud/Canvas.tsx frontend/src/hud/Core.tsx frontend/src/hud/Captions.tsx frontend/src/hud/Canvas.test.tsx
git commit -m "feat(frontend): componentes del HUD (Canvas, Core, Captions)"
```

---

## Task 13: Adaptadores reales nativos del navegador (Web Speech + SpeechSynthesis)

**Files:**
- Create: `frontend/src/voice/adapters/webSpeech.ts`, `frontend/src/voice/adapters/speechSynthesis.ts`

> Estos adaptadores tocan APIs del navegador → no se testean unitariamente; se validan a mano en el Task 15. Cumplen las mismas interfaces que los fakes.

- [ ] **Step 1: Implementar wake word + STT con Web Speech API**

Create `frontend/src/voice/adapters/webSpeech.ts`:

```typescript
import type { WakeWordDetector, Transcriber } from "../types";

// Tipos mínimos de la Web Speech API (no están en lib.dom de forma estable).
type SR = typeof window & { webkitSpeechRecognition?: any; SpeechRecognition?: any };

function newRecognition(): any {
  const w = window as SR;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) throw new Error("Web Speech API no soportada en este navegador");
  const r = new Ctor();
  r.lang = "es-AR";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

// Wake word: reconocimiento continuo que busca "otto" en el transcript.
export class WebSpeechWakeWord implements WakeWordDetector {
  private rec: any;
  start(onWake: () => void) {
    this.rec = newRecognition();
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase();
        if (t.includes("otto")) onWake();
      }
    };
    this.rec.onend = () => { if (this.rec) this.rec.start(); }; // reinicia
    this.rec.start();
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}

export class WebSpeechTranscriber implements Transcriber {
  private rec: any;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.rec = newRecognition();
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) onFinal(text);
        else onPartial(text);
      }
    };
    this.rec.start();
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}
```

- [ ] **Step 2: Implementar TTS con SpeechSynthesis**

Create `frontend/src/voice/adapters/speechSynthesis.ts`:

```typescript
import type { Speaker } from "../types";

export class SpeechSynthesisSpeaker implements Speaker {
  speak(text: string, onEnd: () => void) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-AR";
    u.onend = () => onEnd();
    window.speechSynthesis.speak(u);
  }
  stop() {
    // idempotente: cancel() es seguro aunque no haya nada hablando
    window.speechSynthesis.cancel();
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add frontend/src/voice/adapters/webSpeech.ts frontend/src/voice/adapters/speechSynthesis.ts
git commit -m "feat(frontend): adaptadores nativos Web Speech (wake/STT) + SpeechSynthesis (TTS)"
```

---

## Task 14: Hook `useSession` que cablea adaptadores ↔ FSM

**Files:**
- Create: `frontend/src/voice/useSession.ts`
- Test: `frontend/src/voice/useSession.test.ts`

- [ ] **Step 1: Escribir el test con fakes (falla)**

Create `frontend/src/voice/useSession.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { FakeWakeWord, FakeTranscriber, FakeSpeaker } from "./adapters/fakes";

function setup() {
  const wake = new FakeWakeWord();
  const stt = new FakeTranscriber();
  const tts = new FakeSpeaker();
  const converse = vi.fn().mockResolvedValue({
    narration: "tres atrasadas",
    widgets: [{ type: "kpi_card", title: "Atrasadas", data: { value: 3 } }],
  });
  const hook = renderHook(() =>
    useSession({ wake, stt, tts, converse, closingPhrase: "listo", silenceMs: 30000 }),
  );
  return { ...hook, wake, stt, tts, converse };
}

describe("useSession", () => {
  it("flujo completo: wake -> hablar -> respuesta -> render + speak", async () => {
    const { result, wake, stt, tts, converse } = setup();
    expect(result.current.state).toBe("idle");

    act(() => wake.trigger());
    expect(result.current.state).toBe("listening");

    act(() => stt.emit("cuántas atrasadas", true));
    act(() => stt.emit("", true)); // simula fin de habla via speechEnd interno
    // gatillamos speechEnd manualmente a través del transcriber fake helper:
    act(() => result.current._debugSpeechEnd());

    await waitFor(() => expect(converse).toHaveBeenCalledWith("cuántas atrasadas"));
    await waitFor(() => expect(result.current.state).toBe("speaking"));
    expect(result.current.widgets[0].data).toEqual({ value: 3 });

    act(() => tts.finish());
    await waitFor(() => expect(result.current.state).toBe("listening"));
  });

  it("frase de cierre cierra la sesión", () => {
    const { result, wake, stt } = setup();
    act(() => wake.trigger());
    act(() => stt.emit("listo", true));
    expect(result.current.state).toBe("idle");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- useSession`
Expected: FAIL (no existe `./useSession`)

- [ ] **Step 3: Implementar el hook**

Create `frontend/src/voice/useSession.ts`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reduce, initialState } from "./sessionMachine";
import type {
  SessionState, SessionEvent, Effect, RenderedWidget,
  WakeWordDetector, Transcriber, Speaker,
} from "./types";

interface Deps {
  wake: WakeWordDetector;
  stt: Transcriber;
  tts: Speaker;
  converse: (text: string) => Promise<{ narration: string; widgets: RenderedWidget[] }>;
  closingPhrase: string;
  silenceMs: number;
}

export function useSession(deps: Deps) {
  const [state, setState] = useState<SessionState>(initialState);
  const [caption, setCaption] = useState("");
  const [widgets, setWidgets] = useState<RenderedWidget[]>([]);
  const stateRef = useRef<SessionState>(initialState);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runEffects = useCallback((effects: Effect[]) => {
    for (const eff of effects) {
      switch (eff.kind) {
        case "startListening":
          deps.stt.start(
            (partial) => { setCaption(partial); dispatch({ kind: "transcript", text: partial, final: false }); },
            (final) => {
              setCaption(final);
              if (final.toLowerCase().includes(deps.closingPhrase)) {
                dispatch({ kind: "closingPhrase" });
              } else {
                dispatch({ kind: "transcript", text: final, final: true });
                dispatch({ kind: "speechEnd" });
              }
            },
          );
          break;
        case "stopListening": deps.stt.stop(); break;
        case "stopSpeaking": deps.tts.stop(); break;
        case "speak":
          deps.tts.speak(eff.text, () => dispatch({ kind: "ttsEnd" }));
          break;
        case "render": setWidgets(eff.widgets); break;
        case "callConverse":
          deps.converse(eff.text).then((r) =>
            dispatch({ kind: "response", narration: r.narration, widgets: r.widgets }),
          );
          break;
        case "armSilenceTimer":
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          silenceTimer.current = setTimeout(() => dispatch({ kind: "timeout" }), deps.silenceMs);
          break;
        case "disarmSilenceTimer":
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          break;
      }
    }
  }, [deps]);

  const dispatch = useCallback((event: SessionEvent) => {
    const { state: next, effects } = reduce(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    runEffects(effects);
  }, [runEffects]);

  useEffect(() => {
    deps.wake.start(() => dispatch({ kind: "wakeDetected" }));
    return () => deps.wake.stop();
  }, [deps, dispatch]);

  return useMemo(
    () => ({ state, caption, widgets, _debugSpeechEnd: () => dispatch({ kind: "speechEnd" }) }),
    [state, caption, widgets, dispatch],
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- useSession`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/voice/useSession.ts frontend/src/voice/useSession.test.ts
git commit -m "feat(frontend): hook useSession cableando adaptadores con la FSM"
```

---

## Task 15: Componer App + verificación manual del loop

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`

- [ ] **Step 1: Componer la App con los adaptadores reales**

Replace `frontend/src/App.tsx` con:

```typescript
import { useMemo } from "react";
import { useSession } from "./voice/useSession";
import { WebSpeechWakeWord, WebSpeechTranscriber } from "./voice/adapters/webSpeech";
import { SpeechSynthesisSpeaker } from "./voice/adapters/speechSynthesis";
import { callConverse } from "./api/converse";
import { Core } from "./hud/Core";
import { Captions } from "./hud/Captions";
import { Canvas } from "./hud/Canvas";
import "./App.css";

export default function App() {
  const deps = useMemo(() => ({
    wake: new WebSpeechWakeWord(),
    stt: new WebSpeechTranscriber(),
    tts: new SpeechSynthesisSpeaker(),
    converse: (text: string) => callConverse(text),
    closingPhrase: "listo",
    silenceMs: 35000,
  }), []);

  const { state, caption, widgets } = useSession(deps);

  return (
    <div className="hud">
      <Core state={state} amplitude={state === "listening" || state === "speaking" ? 0.5 : 0} />
      <Canvas widgets={widgets} />
      <Captions text={caption} />
    </div>
  );
}
```

- [ ] **Step 2: Estilos mínimos del HUD**

Replace `frontend/src/App.css` con:

```css
.hud { min-height: 100vh; background: #02060f; color: #cfe8ff; display: grid;
  grid-template-rows: 1fr auto auto; gap: 1rem; padding: 2rem; font-family: system-ui; }
.hud-core { display: flex; flex-direction: column; align-items: center; gap: .5rem; }
.core-orb { width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle, #3fa9ff, #0a3d7a); transition: transform .1s ease; }
.core-idle .core-orb { opacity: .3; }
.core-state { text-transform: uppercase; letter-spacing: .2em; font-size: .75rem; }
.hud-canvas { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; }
.widget { background: #0a1424; border: 1px solid #1d3a5f; border-radius: 8px;
  padding: 1rem; min-width: 160px; }
.widget-title { font-size: .75rem; opacity: .7; }
.kpi-value { font-size: 2.5rem; font-weight: 700; }
.widget-empty { opacity: .5; }
.hud-captions { text-align: center; }
.demo-badge { background: #5a3d00; color: #ffd479; padding: .15rem .5rem;
  border-radius: 4px; font-size: .7rem; margin-right: .5rem; }
table { border-collapse: collapse; } td, th { border: 1px solid #1d3a5f; padding: .25rem .5rem; }
```

- [ ] **Step 3: Verificación manual (humano en el loop)**

Levantá ambos procesos:

```bash
# terminal 1 — backend (necesita ANTHROPIC_API_KEY en el entorno)
cd backend && source .venv/bin/activate && ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY uvicorn app.main:app --reload

# terminal 2 — frontend
cd frontend && npm run dev
```

Abrí `http://localhost:5173` en **Chrome** (Web Speech API), aceptá el permiso de micrófono y verificá a oído:
- Decí **"Otto"** → el núcleo pasa a "escuchando".
- Preguntá *"¿cuántas tareas atrasadas hay?"* → pausá → el núcleo va a "pensando" y luego "hablando", aparece un `kpi_card` con un valor, y Otto narra.
- Cuando Otto termina de narrar → vuelve solo a "escuchando" (la sesión sigue, sin repetir "Otto").
- Decí **"listo"** → vuelve a "en reposo".
- Esperá ~35s en silencio tras activar → vuelve solo a "en reposo".

Expected: el loop completo funciona; los números mostrados vienen del backend (mock), no inventados en pantalla.

> **Barge-in en fase 1:** la FSM ya lo soporta, pero con Web Speech nativo no se puede correr el STT mientras suena el TTS (sin cancelación de eco), así que **no se valida acá** — se cablea de verdad en el Plan 2 con Deepgram corriendo en continuo. Por eso `App.tsx` no inyecta detección de barge-in todavía.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.css
git commit -m "feat(frontend): compone el HUD con adaptadores nativos + verificación manual"
```

---

## Task 16: README de arranque del prototipo

**Files:**
- Create: `README.md`

- [ ] **Step 1: Documentar cómo correr y testear**

Create `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README de arranque del prototipo voice HUD"
```

---

## Próximos planes (no en este plan)

- **Plan 2 — Swap a servicios pro:** Porcupine (wake, WASM local), Deepgram (STT WS), Cartesia/ElevenLabs (TTS), backend acuñando tokens efímeros / proxeando WS. Mismas interfaces de adaptador.
- **Plan 3 — Pulido del HUD:** look Jarvis (núcleo de energía WebGL, paneles laterales) según la imagen modelo en `docs/`. Candidato a la companion visual.
- **Deuda anotada (producción):** la `narration` se templatea desde los resultados de query, no del modelo (ver spec §3).
