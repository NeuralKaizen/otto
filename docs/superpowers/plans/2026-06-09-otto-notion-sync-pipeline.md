# Otto — Sync Pipeline Notion → Postgres (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el pipeline programado que sincroniza el *juego real* de Notion (`Clientes AI` / `Proyectos` / `Tareas`) al store Postgres de Otto — solo datos crudos, con detección de transiciones de estado (CDC) y observabilidad — para que las consultas determinísticas se corran después contra el store, nunca contra Notion en vivo.

**Architecture:** Pipeline Python con adaptador de Notion swappable (API REST headless + `FakeNotion` para tests offline) → mappers puros (página Notion → fila cruda) → store con upserts idempotentes en Postgres (psycopg3). La lógica con riesgo (normalización de status, CDC, cardinalidad) es **pura y testeada sin DB**; el store y la orquestación se testean contra un Postgres efímero vía docker-compose. **Solo se trae lo crudo:** los campos `formula`/`rollup` de Notion NO se sincronizan — se recalculan en SQL en la Fase 3 (regla *dato ≠ presentación*, OTTO_CONTEXT §3 / doc 01 §2).

**Tech Stack:** Python, psycopg3 (`psycopg[binary]`), httpx (Notion REST), pytest, Postgres 16 (docker-compose para dev + tests).

**Specs de referencia:** `OTTO_CONTEXT.md` §4/§8, `docs/00-fuentes-y-consultas.md`, `docs/01-data-model.md` (§3 DDL, §4 mapa de columnas, §6 CDC, §7 status, §8 cardinalidad, §9 estrategia de sync).

**Fuera de scope (a propósito):** las vistas/queries derivadas (V1–V8, progreso, throughput agregado) son la **capa de consulta (Fase 3)** y se construyen aparte; este plan solo deja el store crudo + la memoria de transiciones que las habilita. El directorio `sync/` es hermano de `backend/` (el gateway del prototipo HUD); convergen en un solo servicio más adelante.

---

## Estructura de archivos

**Store / infra**
- `db/schema.sql` — DDL del store (doc 01 §3): tablas base, joins M:N, `tarea_status_eventos`, `sync_anomalias`, `sync_runs`, `status_map`, índices.
- `db/status_map.sql` — seed de normalización de status (doc 01 §7).
- `docker-compose.yml` — Postgres 16 local (dev + tests).

**Pipeline** (`sync/`)
- `sync/requirements.txt`
- `sync/app/__init__.py`
- `sync/app/config.py` — config desde entorno (`DATABASE_URL`, `NOTION_TOKEN`, ids de DBs).
- `sync/app/extract.py` — extractores **puros** de propiedades Notion (JSON → valor Python, tolerante a vacíos).
- `sync/app/status.py` — normalización **pura** `status_raw → canónico`.
- `sync/app/cdc.py` — lógica **pura** de transición de estado (doc 01 §6).
- `sync/app/anomaly.py` — decisiones **puras** de cardinalidad (doc 01 §8).
- `sync/app/mappers.py` — página Notion → fila cruda del store (doc 01 §4).
- `sync/app/notion.py` — adaptador `NotionClient` (interfaz) + `FakeNotion` + `HttpNotionClient`.
- `sync/app/store.py` — upserts idempotentes, joins, anomalías, CDC, archival, `sync_runs` (psycopg3).
- `sync/app/sync.py` — orquestación: incremental por tabla + reconcile (doc 01 §9).
- `sync/app/cli.py` — entrypoint para correr/programar.
- `sync/tests/__init__.py`, `sync/tests/conftest.py`, `sync/tests/test_*.py`.
- `sync/README.md`.

---

## Task 1: Scaffold + Postgres + esquema del store

**Files:**
- Create: `db/schema.sql`, `db/status_map.sql`, `docker-compose.yml`, `sync/requirements.txt`, `sync/app/__init__.py`, `sync/tests/__init__.py`, `sync/tests/conftest.py`, `sync/tests/test_schema.py`

- [ ] **Step 1: Crear el proyecto y dependencias**

```bash
mkdir -p db sync/app sync/tests
cd sync
python -m venv .venv && source .venv/bin/activate
printf 'psycopg[binary]\nhttpx\npytest\n' > requirements.txt
pip install -r requirements.txt
touch app/__init__.py tests/__init__.py
```

- [ ] **Step 2: Levantar Postgres local**

Create `docker-compose.yml` (en la raíz del repo):

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: otto
      POSTGRES_PASSWORD: otto
      POSTGRES_DB: otto
    ports:
      - "5433:5432"
    volumes:
      - otto_pg:/var/lib/postgresql/data

volumes:
  otto_pg:
```

Levantar y crear la base de tests (una sola vez):

```bash
docker compose up -d db
sleep 3
docker compose exec db createdb -U otto otto_test
```

- [ ] **Step 3: Escribir el esquema (DDL)**

Create `db/schema.sql` (fiel a doc 01 §3):

```sql
-- ── Personas (cosechadas de los campos people de Notion) ──
create table personas (
  notion_user_id   uuid primary key,
  nombre           text not null,
  es_firma         boolean not null default false,
  primero_visto    timestamptz not null default now(),
  ultimo_visto     timestamptz not null default now()
);

-- ── Clientes ──
create table clientes (
  notion_id          uuid primary key,
  nombre_cliente     text not null,
  status_raw         text,
  fecha_inicio       date,
  fecha_fin          date,
  notion_last_edited timestamptz not null,
  archived           boolean not null default false,
  deleted_at         timestamptz,
  synced_at          timestamptz not null default now()
);

-- ── Proyectos ──
create table proyectos (
  notion_id          uuid primary key,
  proyecto           text not null,
  estado_raw         text,
  fecha_inicio       date,
  fecha_fin          date,
  proxima_entrega    date,
  cliente_id         uuid not null references clientes(notion_id),
  notion_last_edited timestamptz not null,
  archived           boolean not null default false,
  deleted_at         timestamptz,
  synced_at          timestamptz not null default now()
);

-- ── Tareas (el corazón) ──
create table tareas (
  notion_id          uuid primary key,
  tarea              text,
  status_raw         text,
  prioridad_raw      text,
  energia_raw        text,
  duracion_raw       text,
  fecha_limite       date,
  fecha_creada       timestamptz,
  notas              text,
  proyecto_id        uuid references proyectos(notion_id),
  cliente_id         uuid references clientes(notion_id),
  completada_at      timestamptz,
  notion_last_edited timestamptz not null,
  archived           boolean not null default false,
  deleted_at         timestamptz,
  synced_at          timestamptz not null default now()
);

-- ── Asignaciones M:N ──
create table tarea_responsables (
  tarea_id   uuid references tareas(notion_id) on delete cascade,
  persona_id uuid references personas(notion_user_id),
  primary key (tarea_id, persona_id)
);
create table proyecto_responsables (
  proyecto_id uuid references proyectos(notion_id) on delete cascade,
  persona_id  uuid references personas(notion_user_id),
  primary key (proyecto_id, persona_id)
);

-- ── Memoria de transiciones de estado (CDC) ──
create table tarea_status_eventos (
  id              bigserial primary key,
  tarea_id        uuid references tareas(notion_id),
  status_anterior text,
  status_nuevo    text,
  detectado_at    timestamptz not null default now()
);

-- ── Anomalías del sync ──
create table sync_anomalias (
  id           bigserial primary key,
  tabla        text,
  notion_id    uuid,
  motivo       text,
  payload      jsonb,
  detectado_at timestamptz not null default now()
);

-- ── Observabilidad del pipeline ──
create table sync_runs (
  id            bigserial primary key,
  source_db     text not null,
  modo          text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  rows_upserted int default 0,
  rows_archived int default 0,
  error         text
);

-- ── Normalización de status (doc 01 §7) ──
create table status_map (
  status_raw text primary key,
  canonico   text not null
);

create index on tareas (proyecto_id);
create index on tareas (cliente_id);
create index on tareas (status_raw);
create index on tareas (fecha_limite);
create index on proyectos (cliente_id);
```

Create `db/status_map.sql` (seed, doc 01 §7):

```sql
insert into status_map (status_raw, canonico) values
  ('Not started',     'no_iniciada'),
  ('In progress',     'en_progreso'),
  ('Avances',         'en_progreso'),
  ('Casi Listo',      'casi'),
  ('Casi Terminado',  'casi'),
  ('Casi terminado',  'casi'),
  ('Done',            'hecha'),
  ('Completada',      'hecha')
on conflict (status_raw) do update set canonico = excluded.canonico;
```

- [ ] **Step 4: Configurar pytest (fixtures de Postgres)**

Create `sync/tests/conftest.py`:

```python
import os
import pathlib
import psycopg
import pytest

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://otto:otto@localhost:5433/otto_test"
)
DB_DIR = pathlib.Path(__file__).resolve().parents[2] / "db"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Aplica el esquema una vez por sesión (drop + recreate)."""
    with psycopg.connect(TEST_DB_URL) as c:
        with c.cursor() as cur:
            cur.execute("drop schema public cascade; create schema public;")
            cur.execute(DB_DIR.joinpath("schema.sql").read_text())
            cur.execute(DB_DIR.joinpath("status_map.sql").read_text())
        c.commit()
    yield


@pytest.fixture
def conn():
    """Conexión por test que SIEMPRE hace rollback → aislamiento.
    Las funciones del store NO hacen commit (lo controla el caller)."""
    with psycopg.connect(TEST_DB_URL) as c:
        yield c
        c.rollback()
```

> Nota psycopg3: `execute()` sin parámetros usa el protocolo simple, que acepta varias sentencias separadas por `;` — por eso `schema.sql` entero entra en un solo `execute`. Los upserts del store usan parámetros (una sentencia c/u).

- [ ] **Step 5: Escribir el test de esquema (falla)**

Create `sync/tests/test_schema.py`:

```python
def test_tablas_existen(conn):
    with conn.cursor() as cur:
        cur.execute(
            "select table_name from information_schema.tables "
            "where table_schema = 'public' order by table_name"
        )
        tablas = {r[0] for r in cur.fetchall()}
    esperadas = {
        "personas", "clientes", "proyectos", "tareas",
        "tarea_responsables", "proyecto_responsables",
        "tarea_status_eventos", "sync_anomalias", "sync_runs", "status_map",
    }
    assert esperadas <= tablas


def test_status_map_sembrado(conn):
    with conn.cursor() as cur:
        cur.execute("select canonico from status_map where status_raw = 'Done'")
        assert cur.fetchone()[0] == "hecha"
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_schema.py -v`
Expected: PASS (2 tests) — el esquema y el seed se aplican vía las fixtures.

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql db/status_map.sql docker-compose.yml sync/requirements.txt sync/app/__init__.py sync/tests/__init__.py sync/tests/conftest.py sync/tests/test_schema.py
git commit -m "feat(sync): scaffold pipeline + esquema Postgres del store"
```

---

## Task 2: Extractores puros de propiedades Notion

**Files:**
- Create: `sync/app/extract.py`
- Test: `sync/tests/test_extract.py`

- [ ] **Step 1: Escribir los tests (fallan)**

Create `sync/tests/test_extract.py`:

```python
from app import extract


def test_title_aplana_y_trimea():
    assert extract.title({"title": [{"plain_text": "  Nuts About You "}]}) == "Nuts About You"


def test_title_vacio_es_none():
    assert extract.title({"title": []}) is None
    assert extract.title(None) is None


def test_status_y_select_misma_forma():
    assert extract.status_or_select({"status": {"name": "Done"}}) == "Done"
    assert extract.status_or_select({"select": {"name": "Alta"}}) == "Alta"
    assert extract.status_or_select({"status": None}) is None
    assert extract.status_or_select(None) is None


def test_date_start_end():
    prop = {"date": {"start": "2026-01-01", "end": "2026-02-01"}}
    assert extract.date_start(prop) == "2026-01-01"
    assert extract.date_end(prop) == "2026-02-01"
    assert extract.date_start({"date": None}) is None


def test_relation_ids():
    prop = {"relation": [{"id": "a"}, {"id": "b"}]}
    assert extract.relation_ids(prop) == ["a", "b"]
    assert extract.relation_ids(None) == []


def test_people():
    prop = {"people": [{"id": "u1", "name": "Antonelli"}]}
    assert extract.people(prop) == [{"id": "u1", "name": "Antonelli"}]
    assert extract.people(None) == []


def test_rich_text_y_created_time():
    assert extract.rich_text({"rich_text": [{"plain_text": "urgente"}]}) == "urgente"
    assert extract.rich_text({"rich_text": []}) is None
    assert extract.created_time({"created_time": "2026-06-01T09:00:00.000Z"}) == "2026-06-01T09:00:00.000Z"
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_extract.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.extract'`

- [ ] **Step 3: Implementar los extractores**

Create `sync/app/extract.py`:

```python
"""Extractores PUROS de propiedades Notion: JSON crudo -> valor Python.
Tolerantes a vacíos/null — la data real de Acelera Talent tiene 86% de campos
vacíos (doc 00 §3): nunca explotan, devuelven None / [] según corresponda."""


def title(prop: dict | None) -> str | None:
    if not prop:
        return None
    text = "".join(p.get("plain_text", "") for p in prop.get("title", [])).strip()
    return text or None


def rich_text(prop: dict | None) -> str | None:
    if not prop:
        return None
    text = "".join(p.get("plain_text", "") for p in prop.get("rich_text", [])).strip()
    return text or None


def status_or_select(prop: dict | None) -> str | None:
    if not prop:
        return None
    holder = prop.get("status") or prop.get("select")
    return holder.get("name") if holder else None


def date_start(prop: dict | None) -> str | None:
    if not prop:
        return None
    d = prop.get("date")
    return d.get("start") if d else None


def date_end(prop: dict | None) -> str | None:
    if not prop:
        return None
    d = prop.get("date")
    return d.get("end") if d else None


def relation_ids(prop: dict | None) -> list[str]:
    if not prop:
        return []
    return [r["id"] for r in prop.get("relation", [])]


def people(prop: dict | None) -> list[dict]:
    if not prop:
        return []
    return [{"id": p["id"], "name": p.get("name", "")} for p in prop.get("people", [])]


def created_time(prop: dict | None) -> str | None:
    if not prop:
        return None
    return prop.get("created_time")
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_extract.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/extract.py sync/tests/test_extract.py
git commit -m "feat(sync): extractores puros de propiedades Notion"
```

---

## Task 3: Lógica pura — status, CDC y cardinalidad

**Files:**
- Create: `sync/app/status.py`, `sync/app/cdc.py`, `sync/app/anomaly.py`
- Test: `sync/tests/test_logica.py`

- [ ] **Step 1: Escribir los tests (fallan)**

Create `sync/tests/test_logica.py`:

```python
from app.status import normalize, is_unknown
from app.cdc import transition, should_set_completada, StatusChange
from app.anomaly import pick_one

SMAP = {"Not started": "no_iniciada", "Done": "hecha", "In progress": "en_progreso"}


def test_normalize_conocido_y_desconocido():
    assert normalize("Done", SMAP) == "hecha"
    assert normalize("Algo Nuevo", SMAP) == "sin_estado"
    assert normalize(None, SMAP) == "sin_estado"


def test_is_unknown_solo_para_valores_no_mapeados():
    assert is_unknown("Algo Nuevo", SMAP) is True
    assert is_unknown("Done", SMAP) is False
    assert is_unknown(None, SMAP) is False  # null no es "desconocido", es ausencia


def test_transition_detecta_cambio():
    assert transition("en_progreso", "hecha") == StatusChange("en_progreso", "hecha")
    assert transition(None, "no_iniciada") == StatusChange(None, "no_iniciada")


def test_transition_sin_cambio_es_none():
    assert transition("hecha", "hecha") is None


def test_should_set_completada():
    assert should_set_completada("hecha", None) is True
    assert should_set_completada("hecha", "2026-06-01T00:00:00Z") is False  # ya tenía
    assert should_set_completada("en_progreso", None) is False


def test_pick_one():
    assert pick_one([], "tarea->proyecto").chosen is None
    uno = pick_one(["a"], "tarea->proyecto")
    assert uno.chosen == "a" and uno.anomalia is None
    dos = pick_one(["a", "b"], "tarea->proyecto")
    assert dos.chosen == "a" and "se tomó el primero" in dos.anomalia
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_logica.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.status'`

- [ ] **Step 3: Implementar las tres unidades puras**

Create `sync/app/status.py`:

```python
"""Normalización PURA de status crudo -> canónico (doc 01 §7). El crudo se guarda
fiel en el store; el canónico habilita queries cross-entidad. Desconocido -> sin_estado."""

CANONICOS = {"no_iniciada", "en_progreso", "casi", "hecha", "sin_estado"}


def normalize(status_raw: str | None, status_map: dict[str, str]) -> str:
    if status_raw is None:
        return "sin_estado"
    return status_map.get(status_raw, "sin_estado")


def is_unknown(status_raw: str | None, status_map: dict[str, str]) -> bool:
    """True solo si hay un valor crudo que NO está en el mapa (para loguear anomalía).
    null no cuenta: es ausencia, no un estado nuevo."""
    return status_raw is not None and status_raw not in status_map
```

Create `sync/app/cdc.py`:

```python
"""Lógica PURA de CDC (doc 01 §6). Sin DB: dado el canónico viejo y el nuevo,
decide qué evento registrar y si fijar completada_at. El store la usa al upsertar."""
from dataclasses import dataclass


@dataclass(frozen=True)
class StatusChange:
    status_anterior: str | None
    status_nuevo: str | None


def transition(old_canon: str | None, new_canon: str) -> StatusChange | None:
    if old_canon == new_canon:
        return None
    return StatusChange(status_anterior=old_canon, status_nuevo=new_canon)


def should_set_completada(new_canon: str, completada_at_actual) -> bool:
    """Fija completada_at solo la PRIMERA vez que entra a 'hecha' (doc 01 §6/§10).
    Si la tarea se reabre, completada_at se mantiene (último completado)."""
    return new_canon == "hecha" and completada_at_actual is None
```

Create `sync/app/anomaly.py`:

```python
"""Decisiones PURAS de cardinalidad (doc 01 §8): qué valor tomar cuando una relación
trae más de lo que el modelo simple permite, y si hay que registrar anomalía.
NO escribe — solo decide; el store persiste la anomalía."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Picked:
    chosen: str | None
    anomalia: str | None  # motivo si hubo que descartar algo


def pick_one(ids: list[str], que: str) -> Picked:
    if not ids:
        return Picked(chosen=None, anomalia=None)
    if len(ids) == 1:
        return Picked(chosen=ids[0], anomalia=None)
    return Picked(
        chosen=ids[0],
        anomalia=f"{que}: {len(ids)} valores {ids}; se tomó el primero",
    )
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_logica.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/status.py sync/app/cdc.py sync/app/anomaly.py sync/tests/test_logica.py
git commit -m "feat(sync): lógica pura de status, CDC y cardinalidad"
```

---

## Task 4: Mappers — página Notion → fila cruda

**Files:**
- Create: `sync/app/mappers.py`
- Test: `sync/tests/test_mappers.py`

- [ ] **Step 1: Escribir los tests (fallan)**

Create `sync/tests/test_mappers.py`:

```python
from app import mappers

CLIENTE_PAGE = {
    "id": "11111111-1111-1111-1111-111111111111",
    "last_edited_time": "2026-06-09T10:00:00.000Z",
    "archived": False,
    "properties": {
        "Nombre Cliente": {"title": [{"plain_text": "Nuts About You"}]},
        "Status": {"status": {"name": "In progress"}},
        "Date": {"date": {"start": "2026-01-01", "end": None}},
    },
}

PROYECTO_PAGE = {
    "id": "22222222-2222-2222-2222-222222222222",
    "last_edited_time": "2026-06-09T11:00:00.000Z",
    "archived": False,
    "properties": {
        "Proyecto": {"title": [{"plain_text": "Bot de soporte"}]},
        "Estado": {"status": {"name": "Not started"}},
        "Fechas": {"date": {"start": "2026-03-01", "end": "2026-05-01"}},
        "Próxima Entrega": {"date": {"start": "2026-04-01"}},
        "Clientes AI": {"relation": [{"id": "11111111-1111-1111-1111-111111111111"}]},
        "Responsable": {"people": [{"id": "u-seba", "name": "Sebastian Rodriguez"}]},
    },
}

TAREA_PAGE = {
    "id": "33333333-3333-3333-3333-333333333333",
    "last_edited_time": "2026-06-09T12:00:00.000Z",
    "archived": False,
    "properties": {
        "Tarea": {"title": [{"plain_text": "Llamar a Andres"}]},
        "Status": {"status": {"name": "Done"}},
        "Prioridad": {"select": {"name": "Alta"}},
        "Energía": {"select": {"name": "Reactivo"}},
        "Duración": {"select": {"name": "30 min"}},
        "Fecha límite": {"date": {"start": "2026-06-08"}},
        "Fecha Creada": {"created_time": "2026-06-01T09:00:00.000Z"},
        "Notas": {"rich_text": [{"plain_text": "urgente"}]},
        "Proyectos": {"relation": [{"id": "22222222-2222-2222-2222-222222222222"}]},
        "Clientes AI": {"relation": []},
        # OJO: el campo en Notion está mal escrito "Resposable" (doc 01 §4)
        "Resposable": {"people": [{"id": "u-seba", "name": "Sebastian Rodriguez"}]},
    },
}


def test_map_cliente():
    row = mappers.map_cliente(CLIENTE_PAGE)
    assert row["notion_id"] == "11111111-1111-1111-1111-111111111111"
    assert row["nombre_cliente"] == "Nuts About You"
    assert row["status_raw"] == "In progress"
    assert row["fecha_inicio"] == "2026-01-01"
    assert row["fecha_fin"] is None
    assert row["notion_last_edited"] == "2026-06-09T10:00:00.000Z"
    assert row["archived"] is False


def test_map_proyecto():
    row = mappers.map_proyecto(PROYECTO_PAGE)
    assert row["proyecto"] == "Bot de soporte"
    assert row["estado_raw"] == "Not started"
    assert row["proxima_entrega"] == "2026-04-01"
    assert row["cliente_ids"] == ["11111111-1111-1111-1111-111111111111"]
    assert row["responsables"] == [{"id": "u-seba", "name": "Sebastian Rodriguez"}]


def test_map_tarea_lee_el_typo_resposable():
    row = mappers.map_tarea(TAREA_PAGE)
    assert row["tarea"] == "Llamar a Andres"
    assert row["status_raw"] == "Done"
    assert row["prioridad_raw"] == "Alta"
    assert row["energia_raw"] == "Reactivo"
    assert row["fecha_limite"] == "2026-06-08"
    assert row["proyecto_ids"] == ["22222222-2222-2222-2222-222222222222"]
    assert row["cliente_ids"] == []
    assert row["responsables"][0]["name"] == "Sebastian Rodriguez"


def test_is_firma():
    assert mappers.is_firma("Acelera Talent") is True
    assert mappers.is_firma("  acelera talent ") is True
    assert mappers.is_firma("Sebastian Rodriguez") is False
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_mappers.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.mappers'`

- [ ] **Step 3: Implementar los mappers**

Create `sync/app/mappers.py`:

```python
"""Página Notion (dict) -> fila CRUDA del store (dict). Mapa columna<-propiedad: doc 01 §4.
Solo campos crudos: los formula/rollup de Notion NO se mapean — se recalculan en SQL (Fase 3).
Las relaciones se devuelven como listas de ids; el store elige/decide cardinalidad (doc 01 §8)."""
from app import extract

FIRMA_NOMBRE = "Acelera Talent"


def _meta(page: dict) -> dict:
    return {
        "notion_id": page["id"],
        "notion_last_edited": page["last_edited_time"],
        "archived": page.get("archived", False),
    }


def map_cliente(page: dict) -> dict:
    p = page["properties"]
    return {
        **_meta(page),
        "nombre_cliente": extract.title(p.get("Nombre Cliente")),
        "status_raw": extract.status_or_select(p.get("Status")),
        "fecha_inicio": extract.date_start(p.get("Date")),
        "fecha_fin": extract.date_end(p.get("Date")),
    }


def map_proyecto(page: dict) -> dict:
    p = page["properties"]
    return {
        **_meta(page),
        "proyecto": extract.title(p.get("Proyecto")),
        "estado_raw": extract.status_or_select(p.get("Estado")),
        "fecha_inicio": extract.date_start(p.get("Fechas")),
        "fecha_fin": extract.date_end(p.get("Fechas")),
        "proxima_entrega": extract.date_start(p.get("Próxima Entrega")),
        "cliente_ids": extract.relation_ids(p.get("Clientes AI")),
        "responsables": extract.people(p.get("Responsable")),
    }


def map_tarea(page: dict) -> dict:
    p = page["properties"]
    return {
        **_meta(page),
        "tarea": extract.title(p.get("Tarea")),
        "status_raw": extract.status_or_select(p.get("Status")),
        "prioridad_raw": extract.status_or_select(p.get("Prioridad")),
        "energia_raw": extract.status_or_select(p.get("Energía")),
        "duracion_raw": extract.status_or_select(p.get("Duración")),
        "fecha_limite": extract.date_start(p.get("Fecha límite")),
        "fecha_creada": extract.created_time(p.get("Fecha Creada")),
        "notas": extract.rich_text(p.get("Notas")),
        "proyecto_ids": extract.relation_ids(p.get("Proyectos")),
        "cliente_ids": extract.relation_ids(p.get("Clientes AI")),
        "responsables": extract.people(p.get("Resposable")),  # sic, typo en Notion (doc 01 §4)
    }


def is_firma(person_name: str) -> bool:
    return person_name.strip().lower() == FIRMA_NOMBRE.lower()
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_mappers.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/mappers.py sync/tests/test_mappers.py
git commit -m "feat(sync): mappers Notion -> fila cruda del store"
```

---

## Task 5: Adaptador de Notion (FakeNotion + HttpNotionClient)

**Files:**
- Create: `sync/app/notion.py`
- Test: `sync/tests/test_notion.py`

- [ ] **Step 1: Escribir el test del fake (falla)**

Create `sync/tests/test_notion.py`:

```python
from app.notion import FakeNotion


def _page(pid, edited):
    return {"id": pid, "last_edited_time": edited, "archived": False, "properties": {}}


def test_fake_devuelve_todas_las_paginas_de_la_db():
    fake = FakeNotion({"db1": [_page("a", "2026-06-01T00:00:00Z"),
                              _page("b", "2026-06-09T00:00:00Z")]})
    ids = [p["id"] for p in fake.query_database("db1")]
    assert ids == ["a", "b"]


def test_fake_filtra_por_edited_since():
    fake = FakeNotion({"db1": [_page("a", "2026-06-01T00:00:00Z"),
                              _page("b", "2026-06-09T00:00:00Z")]})
    ids = [p["id"] for p in fake.query_database("db1", edited_since="2026-06-05T00:00:00Z")]
    assert ids == ["b"]


def test_fake_db_desconocida_es_vacio():
    fake = FakeNotion({})
    assert list(fake.query_database("nope")) == []
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_notion.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.notion'`

- [ ] **Step 3: Implementar la interfaz + fake + cliente real**

Create `sync/app/notion.py`:

```python
"""Adaptador de Notion (las 'manos' de lectura, OTTO_CONTEXT §8). Interfaz delgada
sobre la API REST headless (token de integración, NUNCA el MCP hosted — doc 01 §9).
FakeNotion para tests offline; HttpNotionClient para producción. Misma interfaz → swappable."""
from typing import Iterator, Protocol
import httpx

NOTION_VERSION = "2022-06-28"


class NotionClient(Protocol):
    def query_database(
        self, database_id: str, *, edited_since: str | None = None
    ) -> Iterator[dict]:
        ...


class FakeNotion:
    """Devuelve páginas pre-cargadas por database_id. Determinístico, sin red."""

    def __init__(self, pages_by_db: dict[str, list[dict]]):
        self._pages = pages_by_db

    def query_database(self, database_id, *, edited_since=None):
        for page in self._pages.get(database_id, []):
            if edited_since and page["last_edited_time"] < edited_since:
                continue
            yield page


class HttpNotionClient:
    """Cliente real contra la API REST de Notion. Pagina con start_cursor/has_more."""

    def __init__(self, token: str):
        self._client = httpx.Client(
            base_url="https://api.notion.com/v1",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def query_database(self, database_id, *, edited_since=None):
        body: dict = {"page_size": 100}
        if edited_since:
            body["filter"] = {
                "timestamp": "last_edited_time",
                "last_edited_time": {"on_or_after": edited_since},
            }
        cursor = None
        while True:
            if cursor:
                body["start_cursor"] = cursor
            resp = self._client.post(f"/databases/{database_id}/query", json=body)
            resp.raise_for_status()
            data = resp.json()
            yield from data["results"]
            if not data.get("has_more"):
                break
            cursor = data["next_cursor"]
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_notion.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/notion.py sync/tests/test_notion.py
git commit -m "feat(sync): adaptador Notion (FakeNotion + HttpNotionClient REST)"
```

---

## Task 6: Store — upserts de clientes, proyectos, personas y joins

**Files:**
- Create: `sync/app/store.py`
- Test: `sync/tests/test_store.py`

- [ ] **Step 1: Escribir los tests de integración (fallan)**

Create `sync/tests/test_store.py`:

```python
from app import store

CLIENTE = {
    "notion_id": "11111111-1111-1111-1111-111111111111",
    "nombre_cliente": "Nuts About You",
    "status_raw": "In progress",
    "fecha_inicio": "2026-01-01",
    "fecha_fin": None,
    "notion_last_edited": "2026-06-09T10:00:00.000Z",
    "archived": False,
}

PROYECTO = {
    "notion_id": "22222222-2222-2222-2222-222222222222",
    "proyecto": "Bot de soporte",
    "estado_raw": "Not started",
    "fecha_inicio": "2026-03-01",
    "fecha_fin": "2026-05-01",
    "proxima_entrega": "2026-04-01",
    "cliente_ids": ["11111111-1111-1111-1111-111111111111"],
    "responsables": [{"id": "u-seba", "name": "Sebastian Rodriguez"}],
    "notion_last_edited": "2026-06-09T11:00:00.000Z",
    "archived": False,
}


def test_upsert_cliente_es_idempotente(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_cliente(cur, {**CLIENTE, "status_raw": "Avances"})
        cur.execute("select count(*), max(status_raw) from clientes")
        count, status = cur.fetchone()
    assert count == 1
    assert status == "Avances"  # el upsert pisa con el último valor


def test_upsert_proyecto_crea_persona_y_join(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_proyecto(cur, PROYECTO)
        cur.execute("select cliente_id from proyectos where notion_id = %s",
                    (PROYECTO["notion_id"],))
        assert str(cur.fetchone()[0]) == "11111111-1111-1111-1111-111111111111"
        cur.execute("select nombre, es_firma from personas where notion_user_id = 'u-seba'")
        assert cur.fetchone() == ("Sebastian Rodriguez", False)
        cur.execute("select count(*) from proyecto_responsables where proyecto_id = %s",
                    (PROYECTO["notion_id"],))
        assert cur.fetchone()[0] == 1


def test_persona_firma_marcada(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_proyecto(cur, {**PROYECTO,
                                    "responsables": [{"id": "u-firma", "name": "Acelera Talent"}]})
        cur.execute("select es_firma from personas where notion_user_id = 'u-firma'")
        assert cur.fetchone()[0] is True


def test_proyecto_sin_cliente_se_omite_y_loguea(conn):
    with conn.cursor() as cur:
        store.upsert_proyecto(cur, {**PROYECTO, "cliente_ids": []})
        cur.execute("select count(*) from proyectos")
        assert cur.fetchone()[0] == 0
        cur.execute("select motivo from sync_anomalias where tabla = 'proyectos'")
        assert "sin cliente" in cur.fetchone()[0]


def test_anomalia_cliente_multiple_en_proyecto(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_cliente(cur, {**CLIENTE,
                                   "notion_id": "99999999-9999-9999-9999-999999999999"})
        store.upsert_proyecto(cur, {**PROYECTO, "cliente_ids": [
            "11111111-1111-1111-1111-111111111111",
            "99999999-9999-9999-9999-999999999999",
        ]})
        cur.execute("select motivo from sync_anomalias where tabla = 'proyectos'")
        assert "se tomó el primero" in cur.fetchone()[0]
        cur.execute("select cliente_id from proyectos where notion_id = %s",
                    (PROYECTO["notion_id"],))
        assert str(cur.fetchone()[0]) == "11111111-1111-1111-1111-111111111111"


def test_load_status_map(conn):
    with conn.cursor() as cur:
        smap = store.load_status_map(cur)
    assert smap["Done"] == "hecha"


def test_sync_run_lifecycle(conn):
    with conn.cursor() as cur:
        run = store.start_sync_run(cur, "clientes", "incremental")
        store.finish_sync_run(cur, run, rows_upserted=5)
        cur.execute("select rows_upserted, finished_at is not null from sync_runs where id = %s",
                    (run,))
        assert cur.fetchone() == (5, True)
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_store.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.store'`

- [ ] **Step 3: Implementar el store (sin tareas todavía)**

Create `sync/app/store.py`:

```python
"""Store Postgres: upserts idempotentes, joins M:N, anomalías, archival y sync_runs.
Las funciones operan dentro de una transacción y NO hacen commit — lo controla el caller
(sync.py commitea por corrida; los tests hacen rollback). Toda escritura usa parámetros."""
from psycopg.types.json import Json

from app.anomaly import pick_one
from app.cdc import should_set_completada, transition
from app.mappers import is_firma
from app.status import is_unknown, normalize


# ── helpers comunes ──
def load_status_map(cur) -> dict[str, str]:
    cur.execute("select status_raw, canonico from status_map")
    return {r[0]: r[1] for r in cur.fetchall()}


def record_anomaly(cur, tabla, notion_id, motivo, payload):
    cur.execute(
        "insert into sync_anomalias (tabla, notion_id, motivo, payload) "
        "values (%s, %s, %s, %s)",
        (tabla, notion_id, motivo, Json(payload)),
    )


def upsert_persona(cur, person):
    cur.execute(
        """insert into personas (notion_user_id, nombre, es_firma, ultimo_visto)
           values (%s, %s, %s, now())
           on conflict (notion_user_id) do update set
             nombre = excluded.nombre,
             es_firma = personas.es_firma or excluded.es_firma,
             ultimo_visto = now()""",
        (person["id"], person["name"], is_firma(person["name"])),
    )


def set_responsables(cur, join_table, entity_col, entity_id, persons):
    for person in persons:
        upsert_persona(cur, person)
    cur.execute(f"delete from {join_table} where {entity_col} = %s", (entity_id,))
    for person in persons:
        cur.execute(
            f"insert into {join_table} ({entity_col}, persona_id) values (%s, %s) "
            "on conflict do nothing",
            (entity_id, person["id"]),
        )


# ── clientes ──
def upsert_cliente(cur, row):
    cur.execute(
        """insert into clientes
             (notion_id, nombre_cliente, status_raw, fecha_inicio, fecha_fin,
              notion_last_edited, archived, deleted_at, synced_at)
           values
             (%(notion_id)s, %(nombre_cliente)s, %(status_raw)s, %(fecha_inicio)s,
              %(fecha_fin)s, %(notion_last_edited)s, %(archived)s, null, now())
           on conflict (notion_id) do update set
             nombre_cliente = excluded.nombre_cliente,
             status_raw = excluded.status_raw,
             fecha_inicio = excluded.fecha_inicio,
             fecha_fin = excluded.fecha_fin,
             notion_last_edited = excluded.notion_last_edited,
             archived = excluded.archived,
             deleted_at = null,
             synced_at = now()""",
        row,
    )


# ── proyectos ──
def upsert_proyecto(cur, row):
    cli = pick_one(row["cliente_ids"], "proyecto->cliente")
    if cli.anomalia:
        record_anomaly(cur, "proyectos", row["notion_id"], cli.anomalia, row)
    if cli.chosen is None:
        record_anomaly(cur, "proyectos", row["notion_id"],
                       "proyecto sin cliente; se omite (FK NOT NULL)", row)
        return
    params = {**row, "cliente_id": cli.chosen}
    cur.execute(
        """insert into proyectos
             (notion_id, proyecto, estado_raw, fecha_inicio, fecha_fin,
              proxima_entrega, cliente_id, notion_last_edited, archived, deleted_at, synced_at)
           values
             (%(notion_id)s, %(proyecto)s, %(estado_raw)s, %(fecha_inicio)s, %(fecha_fin)s,
              %(proxima_entrega)s, %(cliente_id)s, %(notion_last_edited)s, %(archived)s,
              null, now())
           on conflict (notion_id) do update set
             proyecto = excluded.proyecto,
             estado_raw = excluded.estado_raw,
             fecha_inicio = excluded.fecha_inicio,
             fecha_fin = excluded.fecha_fin,
             proxima_entrega = excluded.proxima_entrega,
             cliente_id = excluded.cliente_id,
             notion_last_edited = excluded.notion_last_edited,
             archived = excluded.archived,
             deleted_at = null,
             synced_at = now()""",
        params,
    )
    set_responsables(cur, "proyecto_responsables", "proyecto_id",
                     row["notion_id"], row["responsables"])


# ── sync_runs (observabilidad) ──
def start_sync_run(cur, source_db, modo) -> int:
    cur.execute(
        "insert into sync_runs (source_db, modo, started_at) values (%s, %s, now()) "
        "returning id",
        (source_db, modo),
    )
    return cur.fetchone()[0]


def finish_sync_run(cur, run_id, rows_upserted, rows_archived=0, error=None):
    cur.execute(
        "update sync_runs set finished_at = now(), rows_upserted = %s, "
        "rows_archived = %s, error = %s where id = %s",
        (rows_upserted, rows_archived, error, run_id),
    )
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_store.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/store.py sync/tests/test_store.py
git commit -m "feat(sync): store de clientes/proyectos/personas + joins + anomalías + sync_runs"
```

---

## Task 7: Store — upsert de tareas con CDC

**Files:**
- Modify: `sync/app/store.py`
- Test: `sync/tests/test_store_tareas.py`

- [ ] **Step 1: Escribir los tests de CDC (fallan)**

Create `sync/tests/test_store_tareas.py`:

```python
from app import store

CLIENTE = {
    "notion_id": "11111111-1111-1111-1111-111111111111",
    "nombre_cliente": "Nuts About You", "status_raw": "In progress",
    "fecha_inicio": None, "fecha_fin": None,
    "notion_last_edited": "2026-06-09T10:00:00.000Z", "archived": False,
}

TAREA = {
    "notion_id": "33333333-3333-3333-3333-333333333333",
    "tarea": "Llamar a Andres", "status_raw": "In progress",
    "prioridad_raw": "Alta", "energia_raw": "Reactivo", "duracion_raw": "30 min",
    "fecha_limite": "2026-06-08", "fecha_creada": "2026-06-01T09:00:00.000Z",
    "notas": "urgente",
    "proyecto_ids": [], "cliente_ids": ["11111111-1111-1111-1111-111111111111"],
    "responsables": [{"id": "u-seba", "name": "Sebastian Rodriguez"}],
    "notion_last_edited": "2026-06-09T12:00:00.000Z", "archived": False,
}


def _smap(cur):
    return store.load_status_map(cur)


def test_upsert_tarea_nueva_registra_evento_inicial(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_tarea(cur, TAREA, _smap(cur))
        cur.execute("select status_anterior, status_nuevo from tarea_status_eventos "
                    "where tarea_id = %s", (TAREA["notion_id"],))
        assert cur.fetchone() == (None, "en_progreso")


def test_transicion_a_hecha_setea_completada_at(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_tarea(cur, TAREA, _smap(cur))
        store.upsert_tarea(cur, {**TAREA, "status_raw": "Done"}, _smap(cur))
        cur.execute("select completada_at is not null from tareas where notion_id = %s",
                    (TAREA["notion_id"],))
        assert cur.fetchone()[0] is True
        cur.execute("select count(*) from tarea_status_eventos where tarea_id = %s "
                    "and status_nuevo = 'hecha'", (TAREA["notion_id"],))
        assert cur.fetchone()[0] == 1


def test_reabrir_mantiene_completada_at(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_tarea(cur, TAREA, _smap(cur))
        store.upsert_tarea(cur, {**TAREA, "status_raw": "Done"}, _smap(cur))
        cur.execute("select completada_at from tareas where notion_id = %s",
                    (TAREA["notion_id"],))
        primero = cur.fetchone()[0]
        store.upsert_tarea(cur, {**TAREA, "status_raw": "In progress"}, _smap(cur))
        cur.execute("select completada_at from tareas where notion_id = %s",
                    (TAREA["notion_id"],))
        assert cur.fetchone()[0] == primero  # se mantiene (doc 01 §10)


def test_status_desconocido_loguea_anomalia(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_tarea(cur, {**TAREA, "status_raw": "Estado Inventado"}, _smap(cur))
        cur.execute("select status_raw from tareas where notion_id = %s", (TAREA["notion_id"],))
        assert cur.fetchone()[0] == "Estado Inventado"  # el crudo se guarda fiel
        cur.execute("select motivo from sync_anomalias where tabla = 'tareas'")
        assert "status desconocido" in cur.fetchone()[0]


def test_tarea_con_dos_proyectos_toma_el_primero_y_loguea(conn):
    # UUIDs válidos pero inexistentes como proyectos: el store loguea la anomalía
    # y NO setea un proyecto_id que violaría la FK (deja null).
    pa = "44444444-4444-4444-4444-444444444444"
    pb = "55555555-5555-5555-5555-555555555555"
    with conn.cursor() as cur:
        store.upsert_cliente(cur, CLIENTE)
        store.upsert_tarea(cur, {**TAREA, "proyecto_ids": [pa, pb]}, _smap(cur))
        cur.execute("select motivo from sync_anomalias where tabla = 'tareas' "
                    "and motivo like 'tarea->proyecto%'")
        assert "se tomó el primero" in cur.fetchone()[0]
        cur.execute("select proyecto_id from tareas where notion_id = %s", (TAREA["notion_id"],))
        assert cur.fetchone()[0] is None
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_store_tareas.py -v`
Expected: FAIL con `AttributeError: module 'app.store' has no attribute 'upsert_tarea'`

- [ ] **Step 3: Agregar `upsert_tarea` al store**

Append a `sync/app/store.py` (al final del archivo):

```python
# ── tareas (con CDC, doc 01 §6) ──
def _proyecto_existe(cur, proyecto_id) -> bool:
    if proyecto_id is None:
        return False
    cur.execute("select 1 from proyectos where notion_id = %s", (proyecto_id,))
    return cur.fetchone() is not None


def _cliente_existe(cur, cliente_id) -> bool:
    if cliente_id is None:
        return False
    cur.execute("select 1 from clientes where notion_id = %s", (cliente_id,))
    return cur.fetchone() is not None


def upsert_tarea(cur, row, status_map):
    # CDC: leer el estado guardado ANTES de pisar
    cur.execute("select status_raw, completada_at from tareas where notion_id = %s",
                (row["notion_id"],))
    existing = cur.fetchone()
    old_canon = normalize(existing[0], status_map) if existing else None
    completada_actual = existing[1] if existing else None
    new_canon = normalize(row["status_raw"], status_map)

    if is_unknown(row["status_raw"], status_map):
        record_anomaly(cur, "tareas", row["notion_id"],
                       f"status desconocido: {row['status_raw']!r} -> sin_estado", row)

    # cardinalidad: elegir uno y loguear si sobra; respetar FK (no setear id inexistente)
    proj = pick_one(row["proyecto_ids"], "tarea->proyecto")
    cli = pick_one(row["cliente_ids"], "tarea->cliente")
    if proj.anomalia:
        record_anomaly(cur, "tareas", row["notion_id"], proj.anomalia, row)
    if cli.anomalia:
        record_anomaly(cur, "tareas", row["notion_id"], cli.anomalia, row)
    proyecto_id = proj.chosen if _proyecto_existe(cur, proj.chosen) else None
    cliente_id = cli.chosen if _cliente_existe(cur, cli.chosen) else None

    params = {**row, "proyecto_id": proyecto_id, "cliente_id": cliente_id}
    cur.execute(
        """insert into tareas
             (notion_id, tarea, status_raw, prioridad_raw, energia_raw, duracion_raw,
              fecha_limite, fecha_creada, notas, proyecto_id, cliente_id,
              notion_last_edited, archived, deleted_at, synced_at)
           values
             (%(notion_id)s, %(tarea)s, %(status_raw)s, %(prioridad_raw)s, %(energia_raw)s,
              %(duracion_raw)s, %(fecha_limite)s, %(fecha_creada)s, %(notas)s,
              %(proyecto_id)s, %(cliente_id)s, %(notion_last_edited)s, %(archived)s,
              null, now())
           on conflict (notion_id) do update set
             tarea = excluded.tarea,
             status_raw = excluded.status_raw,
             prioridad_raw = excluded.prioridad_raw,
             energia_raw = excluded.energia_raw,
             duracion_raw = excluded.duracion_raw,
             fecha_limite = excluded.fecha_limite,
             fecha_creada = excluded.fecha_creada,
             notas = excluded.notas,
             proyecto_id = excluded.proyecto_id,
             cliente_id = excluded.cliente_id,
             notion_last_edited = excluded.notion_last_edited,
             archived = excluded.archived,
             deleted_at = null,
             synced_at = now()""",
        params,
    )
    set_responsables(cur, "tarea_responsables", "tarea_id",
                     row["notion_id"], row["responsables"])

    change = transition(old_canon, new_canon)
    if change:
        cur.execute(
            "insert into tarea_status_eventos (tarea_id, status_anterior, status_nuevo) "
            "values (%s, %s, %s)",
            (row["notion_id"], change.status_anterior, change.status_nuevo),
        )
    if should_set_completada(new_canon, completada_actual):
        cur.execute("update tareas set completada_at = now() where notion_id = %s",
                    (row["notion_id"],))
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_store_tareas.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/store.py sync/tests/test_store_tareas.py
git commit -m "feat(sync): upsert de tareas con CDC (eventos de status + completada_at)"
```

---

## Task 8: Orquestación incremental por tabla

**Files:**
- Create: `sync/app/config.py`, `sync/app/sync.py`
- Test: `sync/tests/test_sync.py`

- [ ] **Step 1: Escribir el test end-to-end con FakeNotion + Postgres (falla)**

Create `sync/tests/test_sync.py`:

```python
from app import sync
from app.config import Config
from app.notion import FakeNotion

CFG = Config(
    database_url="unused-in-test",
    notion_token="unused-in-test",
    db_clientes="db-cli", db_proyectos="db-pro", db_tareas="db-tar",
)

CLIENTE_PAGE = {
    "id": "11111111-1111-1111-1111-111111111111",
    "last_edited_time": "2026-06-09T10:00:00.000Z", "archived": False,
    "properties": {
        "Nombre Cliente": {"title": [{"plain_text": "Nuts About You"}]},
        "Status": {"status": {"name": "In progress"}},
        "Date": {"date": {"start": "2026-01-01", "end": None}},
    },
}
TAREA_PAGE = {
    "id": "33333333-3333-3333-3333-333333333333",
    "last_edited_time": "2026-06-09T12:00:00.000Z", "archived": False,
    "properties": {
        "Tarea": {"title": [{"plain_text": "Llamar a Andres"}]},
        "Status": {"status": {"name": "Done"}},
        "Fecha límite": {"date": {"start": "2026-06-08"}},
        "Proyectos": {"relation": []},
        "Clientes AI": {"relation": [{"id": "11111111-1111-1111-1111-111111111111"}]},
        "Resposable": {"people": [{"id": "u-seba", "name": "Sebastian Rodriguez"}]},
    },
}


def test_sync_clientes_persiste_y_registra_run(conn):
    notion = FakeNotion({"db-cli": [CLIENTE_PAGE]})
    n = sync.sync_clientes(conn, notion, CFG)
    assert n == 1
    with conn.cursor() as cur:
        cur.execute("select nombre_cliente from clientes")
        assert cur.fetchone()[0] == "Nuts About You"
        cur.execute("select source_db, modo, rows_upserted from sync_runs "
                    "where source_db = 'clientes'")
        assert cur.fetchone() == ("clientes", "reconcile", 1)  # sin edited_since => full


def test_sync_tareas_aplica_cdc(conn):
    notion = FakeNotion({"db-cli": [CLIENTE_PAGE], "db-tar": [TAREA_PAGE]})
    sync.sync_clientes(conn, notion, CFG)
    sync.sync_tareas(conn, notion, CFG)
    with conn.cursor() as cur:
        cur.execute("select completada_at is not null from tareas")
        assert cur.fetchone()[0] is True
        cur.execute("select status_nuevo from tarea_status_eventos")
        assert cur.fetchone()[0] == "hecha"


def test_sync_incremental_pasa_modo_y_filtro(conn):
    notion = FakeNotion({"db-cli": [CLIENTE_PAGE]})
    sync.sync_clientes(conn, notion, CFG, edited_since="2026-06-05T00:00:00Z")
    with conn.cursor() as cur:
        cur.execute("select modo from sync_runs where source_db = 'clientes'")
        assert cur.fetchone()[0] == "incremental"
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_sync.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 3: Implementar config y orquestación**

Create `sync/app/config.py`:

```python
"""Config desde el entorno. El token de Notion y la URL de Postgres NUNCA van al repo
(doc 01 §9): viven en .env / secretos del entorno."""
import os
from dataclasses import dataclass


@dataclass
class Config:
    database_url: str
    notion_token: str
    db_clientes: str
    db_proyectos: str
    db_tareas: str


def from_env() -> "Config":
    return Config(
        database_url=os.environ["DATABASE_URL"],
        notion_token=os.environ["NOTION_TOKEN"],
        db_clientes=os.environ["NOTION_DB_CLIENTES"],
        db_proyectos=os.environ["NOTION_DB_PROYECTOS"],
        db_tareas=os.environ["NOTION_DB_TAREAS"],
    )
```

Create `sync/app/sync.py`:

```python
"""Orquestación del sync (doc 01 §9). Dos modos: incremental (con edited_since) y
reconcile (full scan que archiva lo ausente, ver Task 9). Cada corrida deja un sync_run.
El orden importa por las FK: clientes -> proyectos -> tareas."""
from app import mappers, store
from app.config import Config
from app.notion import NotionClient


def sync_clientes(conn, notion: NotionClient, cfg: Config, edited_since: str | None = None) -> int:
    modo = "incremental" if edited_since else "reconcile"
    with conn.cursor() as cur:
        run = store.start_sync_run(cur, "clientes", modo)
        n = 0
        for page in notion.query_database(cfg.db_clientes, edited_since=edited_since):
            store.upsert_cliente(cur, mappers.map_cliente(page))
            n += 1
        store.finish_sync_run(cur, run, n)
    conn.commit()
    return n


def sync_proyectos(conn, notion: NotionClient, cfg: Config, edited_since: str | None = None) -> int:
    modo = "incremental" if edited_since else "reconcile"
    with conn.cursor() as cur:
        run = store.start_sync_run(cur, "proyectos", modo)
        n = 0
        for page in notion.query_database(cfg.db_proyectos, edited_since=edited_since):
            store.upsert_proyecto(cur, mappers.map_proyecto(page))
            n += 1
        store.finish_sync_run(cur, run, n)
    conn.commit()
    return n


def sync_tareas(conn, notion: NotionClient, cfg: Config, edited_since: str | None = None) -> int:
    modo = "incremental" if edited_since else "reconcile"
    with conn.cursor() as cur:
        smap = store.load_status_map(cur)
        run = store.start_sync_run(cur, "tareas", modo)
        n = 0
        for page in notion.query_database(cfg.db_tareas, edited_since=edited_since):
            store.upsert_tarea(cur, mappers.map_tarea(page), smap)
            n += 1
        store.finish_sync_run(cur, run, n)
    conn.commit()
    return n
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_sync.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/app/config.py sync/app/sync.py sync/tests/test_sync.py
git commit -m "feat(sync): orquestación incremental por tabla con sync_runs"
```

---

## Task 9: Reconcile — archivar lo que desapareció de Notion

**Files:**
- Modify: `sync/app/store.py`, `sync/app/sync.py`
- Test: `sync/tests/test_reconcile.py`

> Notion no empuja borrados (doc 01 §9). El reconcile nocturno hace full scan y marca `archived`/`deleted_at` lo que ya no aparece — sin borrar filas (preserva la memoria/auditoría del store, OTTO_CONTEXT §4).

- [ ] **Step 1: Escribir el test (falla)**

Create `sync/tests/test_reconcile.py`:

```python
from app import store, sync
from app.config import Config
from app.notion import FakeNotion

CFG = Config(database_url="x", notion_token="x",
             db_clientes="db-cli", db_proyectos="db-pro", db_tareas="db-tar")


def _cliente_page(pid, nombre):
    return {
        "id": pid, "last_edited_time": "2026-06-09T10:00:00.000Z", "archived": False,
        "properties": {
            "Nombre Cliente": {"title": [{"plain_text": nombre}]},
            "Status": {"status": {"name": "In progress"}},
            "Date": {"date": None},
        },
    }


def test_mark_missing_archived_archiva_ausentes(conn):
    with conn.cursor() as cur:
        store.upsert_cliente(cur, {
            "notion_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "nombre_cliente": "Queda", "status_raw": None,
            "fecha_inicio": None, "fecha_fin": None,
            "notion_last_edited": "2026-06-09T10:00:00.000Z", "archived": False,
        })
        store.upsert_cliente(cur, {
            "notion_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "nombre_cliente": "Se va", "status_raw": None,
            "fecha_inicio": None, "fecha_fin": None,
            "notion_last_edited": "2026-06-09T10:00:00.000Z", "archived": False,
        })
        archived = store.mark_missing_archived(
            cur, "clientes", ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
        )
        assert archived == 1
        cur.execute("select archived from clientes where nombre_cliente = 'Se va'")
        assert cur.fetchone()[0] is True
        cur.execute("select archived from clientes where nombre_cliente = 'Queda'")
        assert cur.fetchone()[0] is False


def test_reconcile_full_marca_lo_ausente(conn):
    # primera pasada: dos clientes
    notion = FakeNotion({"db-cli": [_cliente_page("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "A"),
                                    _cliente_page("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "B")],
                         "db-pro": [], "db-tar": []})
    sync.reconcile(conn, notion, CFG)
    # segunda pasada: B desapareció de Notion
    notion2 = FakeNotion({"db-cli": [_cliente_page("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "A")],
                          "db-pro": [], "db-tar": []})
    res = sync.reconcile(conn, notion2, CFG)
    assert res["clientes"]["archived"] == 1
    with conn.cursor() as cur:
        cur.execute("select archived from clientes where nombre_cliente = 'B'")
        assert cur.fetchone()[0] is True
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_reconcile.py -v`
Expected: FAIL con `AttributeError: module 'app.store' has no attribute 'mark_missing_archived'`

- [ ] **Step 3: Agregar archival al store y reconcile a sync**

Append a `sync/app/store.py`:

```python
# ── reconcile: archivar lo que ya no aparece en Notion (doc 01 §9) ──
def mark_missing_archived(cur, table, seen_ids) -> int:
    """Marca archived/deleted_at las filas cuyo notion_id no está en seen_ids.
    No borra: preserva la memoria/auditoría del store. Si seen_ids viene vacío,
    any(array vacío) es falso -> archiva todo lo no archivado (correcto)."""
    cur.execute(
        f"update {table} set archived = true, deleted_at = now() "
        f"where not (notion_id = any(%(ids)s::uuid[])) and not archived",
        {"ids": list(seen_ids)},
    )
    return cur.rowcount
```

Append a `sync/app/sync.py`:

```python
def reconcile(conn, notion: NotionClient, cfg: Config) -> dict:
    """Full scan de las tres tablas (orden FK: clientes -> proyectos -> tareas),
    upsert de todo lo visto y archival de lo ausente. Una corrida 'reconcile' por tabla."""
    plan = [
        ("clientes", cfg.db_clientes, mappers.map_cliente, store.upsert_cliente, False),
        ("proyectos", cfg.db_proyectos, mappers.map_proyecto, store.upsert_proyecto, False),
        ("tareas", cfg.db_tareas, mappers.map_tarea, store.upsert_tarea, True),
    ]
    results = {}
    for source, db_id, mapper, upsert, needs_smap in plan:
        with conn.cursor() as cur:
            smap = store.load_status_map(cur) if needs_smap else None
            run = store.start_sync_run(cur, source, "reconcile")
            seen, n = [], 0
            for page in notion.query_database(db_id):
                row = mapper(page)
                upsert(cur, row, smap) if needs_smap else upsert(cur, row)
                seen.append(row["notion_id"])
                n += 1
            archived = store.mark_missing_archived(cur, source, seen)
            store.finish_sync_run(cur, run, n, archived)
        conn.commit()
        results[source] = {"upserted": n, "archived": archived}
    return results
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_reconcile.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr toda la suite**

Run: `cd sync && source .venv/bin/activate && pytest -v`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add sync/app/store.py sync/app/sync.py sync/tests/test_reconcile.py
git commit -m "feat(sync): reconcile nocturno que archiva lo ausente (sin borrar)"
```

---

## Task 10: CLI + README + corrida manual contra Notion real

**Files:**
- Create: `sync/app/cli.py`, `sync/README.md`
- Test: `sync/tests/test_cli.py`

- [ ] **Step 1: Escribir el test del parser del CLI (falla)**

Create `sync/tests/test_cli.py`:

```python
from app.cli import build_parser


def test_parser_acepta_comandos():
    parser = build_parser()
    args = parser.parse_args(["tareas", "--since", "2026-06-09T00:00:00Z"])
    assert args.command == "tareas"
    assert args.since == "2026-06-09T00:00:00Z"


def test_parser_reconcile_sin_since():
    parser = build_parser()
    args = parser.parse_args(["reconcile"])
    assert args.command == "reconcile"
    assert args.since is None
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_cli.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.cli'`

- [ ] **Step 3: Implementar el CLI**

Create `sync/app/cli.py`:

```python
"""Entrypoint del pipeline. Programá estos comandos con cadencias de doc 01 §9:
  tareas    ~10 min (incremental) · proyectos/clientes ~1 h (incremental) · reconcile nocturno.
Ejemplos:
  python -m app.cli tareas --since 2026-06-09T00:00:00Z
  python -m app.cli reconcile"""
import argparse

import psycopg

from app import sync
from app.config import from_env
from app.notion import HttpNotionClient


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="otto-sync")
    ap.add_argument("command", choices=["clientes", "proyectos", "tareas", "reconcile"])
    ap.add_argument("--since", default=None,
                    help="ISO8601; corre incremental desde esa fecha (omitir = full)")
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    cfg = from_env()
    notion = HttpNotionClient(cfg.notion_token)
    with psycopg.connect(cfg.database_url) as conn:
        if args.command == "clientes":
            print(sync.sync_clientes(conn, notion, cfg, args.since))
        elif args.command == "proyectos":
            print(sync.sync_proyectos(conn, notion, cfg, args.since))
        elif args.command == "tareas":
            print(sync.sync_tareas(conn, notion, cfg, args.since))
        else:
            print(sync.reconcile(conn, notion, cfg))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd sync && source .venv/bin/activate && pytest tests/test_cli.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Escribir el README del pipeline**

Create `sync/README.md`:

```markdown
# Otto — Sync Pipeline (Fase 2)

Sincroniza el juego real de Notion (`Clientes AI` / `Proyectos` / `Tareas`) al store Postgres.
Solo datos crudos; los derivados se recalculan en la capa de consulta (Fase 3).
Specs: `docs/01-data-model.md` (§3 esquema, §6 CDC, §9 sync).

## Setup
```bash
# Postgres local
docker compose up -d db
docker compose exec db createdb -U otto otto_test   # base de tests (una vez)

# Pipeline
cd sync && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Variables de entorno (NUNCA al repo)
export DATABASE_URL=postgresql://otto:otto@localhost:5433/otto
export NOTION_TOKEN=secret_...
export NOTION_DB_CLIENTES=<database_id>
export NOTION_DB_PROYECTOS=<database_id>
export NOTION_DB_TAREAS=<database_id>

# Aplicar el esquema al store
psql "$DATABASE_URL" -f ../db/schema.sql -f ../db/status_map.sql
```

## Correr
```bash
python -m app.cli tareas --since 2026-06-09T00:00:00Z   # incremental
python -m app.cli reconcile                              # full + archival
pytest                                                   # tests (requiere docker compose up -d db)
```

## Cadencias sugeridas (doc 01 §9)
| Tabla | Incremental | Reconcile |
|---|---|---|
| tareas | ~10 min | nocturno |
| proyectos / clientes | ~1 h | nocturno |

## Costura con el resto de Otto
- **Fase 3 (capa de consulta):** las queries determinísticas (vistas V1–V8 de doc 00) se construyen
  sobre estas tablas; reemplazan el `_MOCK` de `backend/app/queries.py` del prototipo HUD.
- **Programación:** envolver el CLI en cron / scheduler del runtime always-on (OTTO_CONTEXT §9).
```

- [ ] **Step 6: Verificación manual contra Notion real (humano en el loop)**

> Requiere un integration token de Notion con acceso a las 3 DBs y sus `database_id` (doc 00 §1 / OTTO_CONTEXT §8).

```bash
cd sync && source .venv/bin/activate
docker compose -f ../docker-compose.yml up -d db
psql "$DATABASE_URL" -f ../db/schema.sql -f ../db/status_map.sql
python -m app.cli reconcile
psql "$DATABASE_URL" -c "select count(*) from clientes; select count(*) from proyectos; select count(*) from tareas;"
psql "$DATABASE_URL" -c "select tabla, motivo, count(*) from sync_anomalias group by 1,2;"
```

Expected (según doc 00 §1): ~10 clientes, ~11 proyectos, ~106 tareas; las anomalías reflejan los casos
raros (la tarea con 2 proyectos, proyectos sin cliente, status desconocidos), ninguno perdido en silencio.

- [ ] **Step 7: Commit**

```bash
git add sync/app/cli.py sync/README.md sync/tests/test_cli.py
git commit -m "feat(sync): CLI + README + verificación manual contra Notion real"
```

---

## Próximos pasos (no en este plan)

- **Fase 3 — Capa de consulta:** construir las queries determinísticas de las vistas V1–V8 (doc 00 §4)
  como SQL/vistas sobre este store, y el registro de queries que reemplaza el `_MOCK` del prototipo HUD
  (`backend/app/queries.py`). Acá viven los campos derivados (progreso, throughput) que este plan dejó afuera.
- **Fase 5 — Morning report:** job programado que agrega tareas por persona (vía `tarea_responsables`,
  excluyendo `es_firma`) → DM por WhatsApp (template). Se apoya en V5 de doc 00.
- **Fase 6 — Observabilidad:** dashboards sobre `sync_runs` / `sync_anomalias`.
- **Programación real:** cron/scheduler que invoca el CLI con las cadencias de doc 01 §9, en el runtime always-on.
- **Decisiones abiertas (doc 01 §10):** semántica de `Date`/`Fechas`, PaaS de Postgres, política de reapertura.
```

