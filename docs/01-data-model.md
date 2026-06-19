# 01 — Modelo de datos del store (Fase 1)

> Artefacto de modelado. Define el esquema Postgres del store de Otto y cómo se sincroniza desde Notion.
> Base: `00-fuentes-y-consultas.md`. Fuente única = el **juego real** de Notion (`Clientes AI` / `Proyectos` / `Tareas`).
> Respeta la regla **dato ≠ presentación** (OTTO_CONTEXT §3): el store guarda hechos crudos; los agregados se **recalculan**, no se copian.

---

## 1. Principios del store

1. **El store es el warehouse de consulta + la memoria/auditoría de Otto** (§4). Notion NO es el datastore.
2. **Se sincroniza solo lo crudo.** Los campos `formula`/`rollup` de Notion (`# Tareas`, `Progreso`, `Barra Progreso`, etc.) **NO se traen** — se recalculan en SQL desde las tablas base (§5). Copiarlos sería dejar que "el número venga de afuera" en vez de la query determinística.
3. **Fiel pero sin sobre-ingeniería.** FK donde la data probó cardinalidad ≤1; tablas de join solo donde hay M:N real (responsables, y el outlier tarea→proyecto). Nada se descarta en silencio (§ anti-patrón "no silent caps"): lo raro se loguea.
4. **El store recuerda lo que Notion olvida.** Notion no guarda *cuándo* una tarea pasó a Done → el sync detecta transiciones de estado y las persiste (§6). Esto desbloquea throughput (V8).

---

## 2. Diagrama

```
personas ──< tarea_responsables >── tareas >──┐
   │                                  │ proyecto_id (FK, nullable)
   └──< proyecto_responsables >── proyectos    │ cliente_id   (FK, nullable)
                                  │ cliente_id (FK, NOT NULL)  │
                                  └── clientes ───────────────┘
                                          ▲
                          (cliente efectivo de una tarea =
                           cliente_id directo, o el del proyecto)

tarea_status_eventos  ── append-only, memoria de transiciones (CDC)
sync_runs             ── observabilidad del pipeline
```

---

## 3. Esquema (DDL)

```sql
-- ── Personas (cosechadas de los campos people de Notion) ──
create table personas (
  notion_user_id   uuid primary key,
  nombre           text not null,
  es_firma         boolean not null default false,  -- "Acelera Talent" = la firma, no una persona
  primero_visto    timestamptz not null default now(),
  ultimo_visto     timestamptz not null default now()
);

-- ── Clientes ──
create table clientes (
  notion_id          uuid primary key,
  nombre_cliente     text not null,
  status_raw         text,            -- crudo de Notion (status)
  fecha_inicio       date,            -- de "Date" (start)
  fecha_fin          date,            -- de "Date" (end, si hay)
  -- metadatos de sync
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
  fecha_inicio       date,            -- de "Fechas" (start)
  fecha_fin          date,            -- de "Fechas" (end)
  proxima_entrega    date,            -- de "Próxima Entrega"
  cliente_id         uuid not null references clientes(notion_id),
  notion_last_edited timestamptz not null,
  archived           boolean not null default false,
  deleted_at         timestamptz,
  synced_at          timestamptz not null default now()
);

-- ── Tareas (el corazón) ──
create table tareas (
  notion_id          uuid primary key,
  tarea              text,            -- title (puede venir vacío en la fuente)
  status_raw         text,
  prioridad_raw      text,            -- [Alta, Media, Baja, Prioridad]
  energia_raw        text,            -- [Deep Work, Reactivo, Admin, Llamada]
  duracion_raw       text,            -- [15 min, 30 min, 1 hora, 2+ horas]
  fecha_limite       date,
  fecha_creada       timestamptz,     -- created_time de Notion
  notas              text,            -- rich_text aplanado
  proyecto_id        uuid references proyectos(notion_id),   -- nullable (75/106 sin proyecto)
  cliente_id         uuid references clientes(notion_id),    -- nullable; casi siempre null (vía proyecto)
  completada_at      timestamptz,     -- derivado por el sync (§6), NO viene de Notion
  notion_last_edited timestamptz not null,
  archived           boolean not null default false,
  deleted_at         timestamptz,
  synced_at          timestamptz not null default now()
);

-- ── Asignaciones M:N (campos people son multi-valor) ──
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

-- ── Memoria de transiciones de estado (CDC, resuelve throughput) ──
create table tarea_status_eventos (
  id            bigserial primary key,
  tarea_id      uuid references tareas(notion_id),
  status_anterior text,
  status_nuevo  text,
  detectado_at  timestamptz not null default now()
);

-- ── Anomalías del sync (lo que no entra en el modelo simple, sin perderlo) ──
create table sync_anomalias (
  id          bigserial primary key,
  tabla       text,
  notion_id   uuid,
  motivo      text,            -- ej: "tarea con 2 proyectos; se tomó el primero"
  payload     jsonb,
  detectado_at timestamptz not null default now()
);

-- ── Observabilidad del pipeline (semilla de Fase 6) ──
create table sync_runs (
  id            bigserial primary key,
  source_db     text not null,   -- 'clientes' | 'proyectos' | 'tareas'
  modo          text not null,   -- 'incremental' | 'reconcile'
  started_at    timestamptz not null,
  finished_at   timestamptz,
  rows_upserted int default 0,
  rows_archived int default 0,
  error         text
);

create index on tareas (proyecto_id);
create index on tareas (cliente_id);
create index on tareas (status_raw);
create index on tareas (fecha_limite);
create index on proyectos (cliente_id);
```

---

## 4. Mapa columna ← propiedad Notion

| Tabla.columna | Propiedad Notion | Tipo Notion |
|---|---|---|
| `clientes.nombre_cliente` | `Nombre Cliente` | title |
| `clientes.status_raw` | `Status` | status |
| `clientes.fecha_inicio/fin` | `Date` | date |
| `proyectos.proyecto` | `Proyecto` | title |
| `proyectos.estado_raw` | `Estado` | status |
| `proyectos.fecha_inicio/fin` | `Fechas` | date |
| `proyectos.proxima_entrega` | `Próxima Entrega` | date |
| `proyectos.cliente_id` | `Clientes AI` | relation |
| `proyecto_responsables` | `Responsable` | people |
| `tareas.tarea` | `Tarea` | title |
| `tareas.status_raw` | `Status` | status/select |
| `tareas.prioridad_raw` | `Prioridad` | select |
| `tareas.energia_raw` | `Energía` | select |
| `tareas.duracion_raw` | `Duración` | select |
| `tareas.fecha_limite` | `Fecha límite` | date |
| `tareas.fecha_creada` | `Fecha Creada` | created_time |
| `tareas.notas` | `Notas` | rich_text |
| `tareas.proyecto_id` | `Proyectos` | relation |
| `tareas.cliente_id` | `Clientes AI` | relation |
| `tarea_responsables` | `Resposable` *(sic, typo en Notion)* | people |

**NO se sincronizan** (son derivados, ver §5): `# Proyectos`, `# Tareas`, `Progreso Cliente`, `Progreso`, `Estado Tiempo`, `Tareas Abiertas`, `Barra Progreso`, `# Completadas`, y los campos `Formula` genéricos.

---

## 5. Campos derivados — se recalculan, no se copian (regla §3)

Cada fórmula/rollup de Notion se reconstruye con SQL determinístico sobre las tablas base. Se exponen como **vistas**:

| Métrica Notion | Recálculo en el store |
|---|---|
| `# Tareas` (proyecto) | `count(*) from tareas where proyecto_id = P and not archived` |
| `# Completadas` | `count(*) ... where status canónico = 'hecha'` |
| `Tareas Abiertas` | `# Tareas − # Completadas` |
| `Progreso` (proyecto) | `# Completadas / nullif(# Tareas,0)` |
| `# Proyectos` (cliente) | `count(*) from proyectos where cliente_id = C` |
| `# Tareas` (cliente) | tareas del cliente directo **o** vía sus proyectos |
| `Progreso Cliente` | agregación de progreso de sus proyectos |

> Si una vista necesita un número, sale de acá. El LLM nunca lo calcula (§3).

**Cliente efectivo de una tarea** (porque 97/106 no linkean cliente directo):
```sql
coalesce(t.cliente_id, p.cliente_id)  -- directo, si no el del proyecto
```

---

## 6. Memoria de transiciones (CDC) — desbloquea throughput (V8)

Notion no guarda *cuándo* una tarea pasó a Done. El sync lo deriva:

- En cada corrida incremental, para cada tarea cuyo `status_raw` cambió respecto del valor guardado → insertar fila en `tarea_status_eventos` (anterior → nuevo).
- Si el nuevo estado es canónico `hecha` y `completada_at` está null → setear `completada_at = now()`. (Aproxima el momento real al de detección; con sync cada ~10 min el error es chico.)
- Throughput (tareas completadas por semana / persona) = agregación sobre `tarea_status_eventos`.

Esto es la faceta "memoria/auditoría" del store (§4) hecha concreta.

---

## 7. Normalización de status

Los estados crudos son inconsistentes entre tablas y tienen typos. Se guarda **el crudo** (`status_raw`, fiel) y se mapea a un **canónico** para queries cross-entidad, vía tabla de referencia:

| status_raw (visto en Notion) | canónico |
|---|---|
| `Not started` | `no_iniciada` |
| `In progress` | `en_progreso` |
| `Avances` | `en_progreso` |
| `Casi Listo`, `Casi Terminado`, `Casi terminado` | `casi` |
| `Done`, `Completada` | `hecha` |
| `(vacío)` / null | `sin_estado` |

```sql
create table status_map (
  status_raw text primary key,
  canonico   text not null   -- no_iniciada | en_progreso | casi | hecha | sin_estado
);
```
"Abierta" = canónico ≠ `hecha`. Mapeo nuevo desconocido → cae a `sin_estado` y se loguea en `sync_anomalias` (que no se nos escape un estado nuevo).

---

## 8. Relaciones — decisiones (con evidencia de cardinalidad)

| Relación | Cardinalidad observada | Decisión |
|---|---|---|
| proyecto → cliente | 11/11 con exactamente 1 | **FK NOT NULL** |
| tarea → cliente | máx 1 (97×0, 9×1) | **FK nullable** |
| tarea → proyecto | máx 2 (75×0, 30×1, **1×2**) | **FK nullable** = primer proyecto; el caso de 2 se registra en `sync_anomalias` (no se pierde) |
| tarea → responsables | 0/1/2 | **tabla join** `tarea_responsables` |
| proyecto → responsables | 0/1/2 | **tabla join** `proyecto_responsables` |
| cliente → person | 10/10 vacío | se modela (`cliente_personas` diferida hasta que se use) |

> Guard de sync: si mañana proyecto→cliente trae >1, o tarea→proyecto se vuelve común con >1, se promueve a join. Hoy FK + anomalías es lo correcto y simple.

---

## 9. Estrategia de sync (Fase 2)

**Dos modos:**
- **Incremental** (frecuente): query a Notion con filtro `last_edited_time on_or_after = <último sync ok>`, ordenado desc. Upsert por `notion_id`. Detecta cambios de status → §6.
- **Reconcile** (nocturno, full scan): trae todo, marca `archived`/`deleted_at` lo que ya no aparece o vino `archived:true` (Notion no empuja borrados).

**Cadencia por tabla** (volúmenes chicos, rate limit Notion ~180 req/min sobra):

| Tabla | Incremental | Reconcile |
|---|---|---|
| `tareas` | ~10 min | nocturno |
| `proyectos` | ~1 h | nocturno |
| `clientes` | ~1 h | nocturno |
| `personas` | oportunista (de los people que aparecen) | nocturno |

**Personas:** se upsertan de los objetos `people` (id + nombre) vistos al sincronizar tareas/proyectos. La cuenta "Acelera Talent" se marca `es_firma = true` (para excluirla de las vistas de carga por persona).

**Conector:** API REST + integration token (headless, §8), NO el MCP hosted. Token en `.env` / secreto del entorno, nunca en el repo.

---

## 10. Supuestos y decisiones abiertas (para Fase 2)

- **Semántica de `Date` (clientes) y `Fechas` (proyectos):** se asume start = inicio, end = fin. Confirmar con el equipo qué representan.
- **`completada_at` aproximado** al momento de detección, no al real (Notion no lo da). Aceptable para throughput semanal.
- **Reabrir tareas:** si una tarea sale de `hecha`, se registra el evento; `completada_at` se mantiene (último completado) salvo que se decida otra política.
- **Postgres dónde corre:** servicio always-on (§9) — definir PaaS en Fase 2.
