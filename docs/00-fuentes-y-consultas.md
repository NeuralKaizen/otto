# 00 — Fuentes y consultas (Fase 0)

> Artefacto de modelado. No es código. Base para `01-data-model.md`.
> Instancia #0 = **Acelera Talent** (la firma AI-first). Fuente: Notion (explorada vía API REST, read-only).
> Fecha de exploración: 2026-06-09.

---

## 1. Fuentes reales en Notion

Se compartieron **6 databases**, que son **dos juegos casi duplicados**. Otto usa solo el juego real.

### Juego REAL — el que usa el equipo (Otto lee esto)
Modelo de 2 niveles, mantenido día a día.

| DB | id (8) | Filas | Rol |
|----|--------|------|-----|
| `Clientes AI` | `378c40c6` | 10 | Cartera de clientes |
| `Proyectos` | `360c40c6` | 11 | Proyectos por cliente |
| `Tareas` | `02378a2f` | 106 | Tareas (el corazón operativo) |

Relaciones: `Clientes ←→ Proyectos ←→ Tareas` (y `Clientes ←→ Tareas` directa).

### Juego DUPLICADO — copia de prueba, casi vacía (Otto lo IGNORA)
Una segunda versión, más nueva, con una capa extra de **Fases**. Pero solo tiene datos de prueba de **un cliente** (`Mellow and Banana`): 1 cliente, 4 fases, 16 tareas, todas `Completada`, sin actividad desde 2026-06-06. Candidatas a archivar en Notion.

| DB | id (8) | Filas |
|----|--------|------|
| `Clientes AI (2)` | `376c...80ff` | 1 |
| `Fases AI` | `376c...80b4` | 4 |
| `Tareas AI` | `376c...802e` | 16 |

> **Decisión:** el juego duplicado se ignora. Otto modela solo el juego real (2 niveles: Clientes → Proyectos → Tareas).

---

## 2. El equipo (responsables reales)

Extraídos de los campos `people` del Sistema A:

- **Acelera Talent** = la **firma misma** (instancia #0), NO una persona. Aparece como responsable en 11 tareas = cajón compartido de la cuenta-firma → funcionalmente "sin dueño real". No cuenta como persona en las vistas de carga por persona.
- Personas reales del equipo: **Sebastian Rodriguez**, **Antonelli**, **Sebastiano Ruocco Lopez**.

Clientes activos: Andres E-commerce, Nuts About You, Molt, Moraich, Asaecs, Psicologos, Mellow, Lanzamiento AI, Alta, y Acelera Talent (proyecto interno).

---

## 3. Hallazgo crítico: higiene de datos

El feature estrella (morning report "tareas del día por persona", §1) depende de campos que **hoy están mayormente vacíos**:

| Campo (DB `Tareas`, 106 filas) | Vacío | % |
|---|---|---|
| **Responsable** | 91 | **86%** |
| Fecha límite | 51 | 48% |
| Status | 27 | 25% |
| Prioridad | 72 | 68% |
| Energía | 52 | 49% |

- Solo **5 tareas** están asignadas a una **persona real** (Sebastian 1, Antonelli 3, Sebastiano 1). Las otras 101 están vacías (91) o en la cuenta-firma "Acelera Talent" (11) → sin dueño individual.
- Tareas que **vencen hoy: 0**. Vencidas (no Done): **19**.
- `Proyectos`: los **11 están en `Not started`**; solo 1 tiene `Próxima Entrega`. El campo Estado no se mantiene.
- `Clientes`: este sí está bien mantenido (Status con valores reales repartidos).

**Principio de arranque (decisión del equipo):** Otto **muestra lo que ya está en Notion, tal cual** — no se le pide al equipo que llene campos ni se bloquea por data incompleta. Si una tarea no tiene dueño o fecha, Otto la muestra así (mostrar esos huecos *es* la vista de coordinación). Otto no inventa dueños ni fechas (regla §3); refleja la realidad. Por eso las vistas se priorizan en dos tandas: las que ya tienen de dónde salir, y las que se vuelven ricas solas a medida que el equipo completa datos — sin reescribir nada.

---

## 4. Las vistas clave (priorizadas por viabilidad con la data de hoy)

> Cada vista: qué muestra · query determinística (pseudo) · por qué · estado con la data actual.
> Recordatorio §3: los números salen de estas queries contra el store, nunca del LLM.

### TANDA 1 — Funcionan HOY (arrancar acá)

**V1 · Pulso de coordinación** ⭐ *(la vista-secretaria; el morning report v0)*
Lo que se está cayendo, en un tablero:
- Tareas **vencidas** (Fecha límite < hoy AND Status ≠ Done) → hoy: 19
- Tareas **sin dueño** (Responsable vacío) → hoy: 91
- Tareas **sin status** → hoy: 27
- Proyectos **sin Próxima Entrega** ni Estado real
- *Por qué:* es lo que la firma necesita ver primero y lo único que la data soporta hoy. Crea el incentivo para llenar campos.

**V2 · Pipeline de clientes**
`Clientes` agrupados por `Status` (Not started → In progress → Avances → Casi terminado → Done), con # proyectos y # tareas abiertas por cliente.
- *Por qué:* la data de clientes está bien mantenida; responde "¿cómo viene la cartera?".

**V3 · Deadlines: vencidas + próximos 7 días**
`Tareas` con Fecha límite ≤ hoy+7, ordenadas por fecha, marcando vencidas. Agrupado por cliente/proyecto.
- *Por qué:* no perder entregas; funciona con las 55 tareas que sí tienen fecha.

**V4 · En qué trabaja el equipo (foco)**
Distribución de `Energía` (Deep Work 43 / Reactivo / Admin / Llamada) y `Prioridad`; tareas abiertas por responsable (para los que tienen dueño).
- *Por qué:* insight de cómo se gasta el tiempo; ya hay señal en Energía.

### TANDA 2 — Se desbloquean cuando mejore la data (el incentivo de V1)

**V5 · Mi día / Morning report por persona** *(el destino de §1)*
`Tareas` con Fecha límite = hoy (o vencidas) AND Status ≠ Done, **agrupadas por Responsable** → DM a cada uno con lo suyo.
- *Estado:* hoy inservible (86% sin dueño, 0 vencen hoy). Valioso apenas el equipo asigne responsables y fechas.

**V6 · Estado real de proyectos**
`Proyectos` por `Estado` + `Próxima Entrega` + `Progreso` (% tareas completadas).
- *Estado:* hoy inutilizable (todos Not started, 1 entrega cargada). Necesita que se mantenga el Estado.

**V7 · Salud por cliente (drill-down)**
Por cliente: # proyectos por estado, # tareas abiertas/cerradas, % progreso, última actividad.
- *Estado:* parcial vía relations; mejora con V6.

**V8 · Throughput (completadas por semana)**
Conteo de tareas pasadas a Done por semana / por persona.
- *Estado:* **gap de modelo** — hoy no hay timestamp de completado (Done no guarda cuándo). A resolver en Fase 1 (capturar fecha de cambio a Done en el sync).

---

## 5. Qué pasa a Fase 1 (data model)

1. Modelar el **Sistema A** en Postgres: `clientes`, `proyectos`, `tareas` + tablas/columnas de relación.
2. Normalizar **responsables** (la gente de Notion) a una tabla `personas` — clave para las vistas por persona.
3. Resolver el **gap de throughput (V8):** capturar en el sync el momento de cambio de Status a Done (snapshotting o histórico), ya que Notion no lo expone nativo.
4. Decidir typo/normalización de campos sucios (`Resposable` mal escrito, status `(vacío)`, etc.).
5. Definir cadencia de sync por DB (Tareas cambia seguido; Clientes/Proyectos, lento).

## 6. Decisiones tomadas

- **Juego duplicado (Tareas AI / Fases AI):** se ignora. Otto modela solo el juego real (Clientes → Proyectos → Tareas, 2 niveles).
- **Higiene de datos:** NO es prerequisito. Otto arranca mostrando lo que ya está en Notion; la data incompleta se refleja, no se bloquea. La Tanda 2 se enriquece sola cuando el equipo complete campos.
- **"Acelera Talent" como responsable** = la cuenta-firma (instancia #0), no una persona → se trata como "sin dueño individual" en las vistas de carga por persona.
