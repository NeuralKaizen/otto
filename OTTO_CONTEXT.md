# OTTO_CONTEXT.md

> Documento de contexto para Claude Code. Léelo completo antes de proponer nada.
> Estado: **fase de modelado / build inicial**. Scope acotado a **CONSULTA + DISPLAY** (no acciones).
> No escribas código hasta que el plan por fases lo indique. Reemplaza lo que esté entre `[corchetes]`.

---

## 1. Qué es Otto

Un agente de IA para **Acelera Talent**, una firma que automatiza procesos para otras empresas y quiere ser AI-first.

**Fase actual: agente de consulta y display, no de acción.** Otto lee los datos de las fuentes de la empresa, responde preguntas sobre ellos, y los muestra de forma clara y linda (dashboards + reportes). No escribe ni muta nada.

Única excepción de "acción": un **morning report** programado que lee las tareas del día por persona y se las manda a cada uno por WhatsApp (DM con SUS tareas). Es lectura + display con horario, no una acción que cambie algo.

**Enfoque:** se construye interno primero (instancia #0 = la firma misma) y se diseña para generalizarse a clientes después.

---

## 2. Principios rectores (no negociables)

1. **Vertical primero, generalización después.** Se modela un caso real de punta a punta; lo reutilizable se extrae después.
2. **Instancia #0, no herramienta interna.** Desde el día uno se separa núcleo (reutilizable) de config de instancia (específica). Para la #0, "el cliente" es la firma.
3. **El framework de generalización se extrae de la repetición, no se predice.** La #0 enseña qué es núcleo; las #1/#2 enseñan qué es config.
4. **Empezar y quedarse en consulta (L0).** No se agregan acciones que escriban o muten hasta que el valor de consulta esté probado.

---

## 3. La regla de carga de esta fase: dato ≠ presentación

En un agente de consulta + display, lo difícil no es "no romper nada"; es **que los datos que muestra sean ciertos**.

**El LLM arregla y narra; el LLM NO inventa los números.**

- El LLM traduce la pregunta a una **query** (o elige una vista predefinida) y decide *cómo* mostrarla.
- Los números salen de la query determinística contra el store propio, **nunca** de la cabeza del modelo.
- Un número inventado en un dashboard se ve *autoritativo* → es peor que una respuesta mala en chat.

Esta regla es la versión "display" del paso *verificar* del loop. Si el modelo está sumando datos de cabeza, está mal hecho.

**Corolario para el canvas agent-driven (UI generativa):** cuando el LLM arma el dashboard on-demand, **emite el *spec* de la UI — qué widget, qué query, qué layout — NUNCA los datos**. El flujo: LLM compone `[kpi_card(query A), line_chart(query B), table(query C)]` → backend corre las queries determinísticas → el renderer bindea datos reales a cada componente. El LLM elige *qué mostrar y cómo*; los números los pone la query. Un dashboard generativo es el peor lugar para un número inventado, porque se ve hermoso y autoritativo.

---

## 4. Arquitectura de datos (el centro de esta fase)

```
Fuentes (Notion, etc.) → sync programado → store propio (Postgres) → Otto consulta el store → display (dashboards + morning report)
```

- Otto **no** consulta las fuentes en vivo para los dashboards. Consulta el store ya sincronizado. Razones: rate limits de las fuentes (Notion corta a ~180 req/min) y poder correr agregaciones de verdad.
- El **pipeline** de esta fase = el sync/refresh programado fuente → store. No ejecuta acciones de negocio; solo mantiene fresca la capa que alimenta las consultas. (Esto es lo que significa "mantenimiento de los dashboards".)
- El store propio (Postgres) es a la vez el **warehouse de consulta** y la **memoria/auditoría** de Otto. Las fuentes (Notion, etc.) NO son el datastore de Otto.

---

## 5. Las capas (ajustadas a consulta)

| Capa | En esta fase |
|------|--------------|
| Interfaz | Dos superficies: **WhatsApp** (ambiente/rápido/push — consultas sueltas + morning report) y **web canvas "Jarvis"** (UI generativa agent-driven — sesión visual/exploratoria). Ambas comen de la misma capa de query. Notion = display "lindo" del report + feed de conocimiento. Ver §12 |
| Cerebro | LLM frontier por API, detrás de un adaptador, swappable (§7) |
| Manos | Conectores de **lectura**, vía MCP/API |
| Datos | Store propio (Postgres) + sync programado desde fuentes |
| Display | Dashboards + reportes "lindos" — trabajo de diseño real |
| Guardrails | Mínimos hoy: read-only + least-privilege en los conectores |

---

## 6. El loop (versión consulta)

```
percibir (pregunta o schedule) → planear (¿qué query / qué vista?) → consultar (query determinística al store) → verificar (los números vienen de la query, no del modelo) → presentar (display) → recordar (opcional)
```

---

## 7. Cerebro y stack (decisiones ya tomadas)

- **Cerebro:** modelo frontier por API, detrás de un **adaptador delgado** (model gateway propio) → swappable. Default razonable: Claude. **No** construyas routing multi-modelo todavía; un solo modelo para todo, y enrutas a modelos baratos *después*, cuando los datos muestren dónde.
- **Lenguaje:** abierto. Lean: **Python** para el core del agente (ecosistema IA/datos más rico). TS es viable si el equipo de la firma es más fuerte ahí.
- El cerebro nunca "vive dentro de Python": es un servicio al que se le habla por API (cierto incluso si auto-hospedas, vía vLLM/Ollama).

---

## 8. Conectores — nota sobre Notion (fuente confirmada)

Notion juega tres papeles: conector de lectura (manos), feed de conocimiento (config), y fuente de triggers (vía webhooks).

- **Notion NO es el datastore de Otto.** Sincronízalo a Postgres.
- **Gotcha clave:** el MCP hosted oficial de Notion es OAuth/interactivo y **no está diseñado para agentes headless**. Para lo programado/sin-humano (sync, morning report) usa la **API REST + integration token**, no el MCP hosted.
- Para que un cambio en Notion *dispare* algo en Otto: **webhooks** de la API (el MCP no tiene superficie de eventos).
- **Least-privilege gratis:** las integraciones de Notion solo ven lo que les compartes explícitamente. Dale a Otto acceso únicamente a los espacios/DBs que necesita.

---

## 8.1 Interfaz — nota sobre WhatsApp (canal confirmado)

WhatsApp es la superficie de **conversación** (1:1 con el número de Otto) y de **push** (morning report). Mismo patrón headless que Notion: **API REST + webhooks**, no MCP interactivo. WhatsApp recibe por webhook → Otto procesa → responde por API.

- **La Cloud API oficial es 1:1, NO de grupos.** No se postea a grupos con la API oficial. Las libs que lo hacen (`whatsapp-web.js`) son no-oficiales, violan ToS y son frágiles → no usar. El morning report va como **DM por persona** (encaja con "tareas por persona" de §1).
- **Ventana de 24h:** fuera de las 24h desde el último mensaje del usuario, solo se puede mandar un **message template pre-aprobado** por Meta. El morning report es proactivo → requiere template de "reporte diario" registrado.
- **Setup:** Meta Business verificada + número **dedicado** a Otto (no personal) + alta en WhatsApp Business Platform.
- **Display rico vive en Notion**, no en WhatsApp (WhatsApp solo da texto + imágenes). El web app de dashboards se difiere hasta probar el valor.

---

## 9. Runtime / despliegue

- Otto es un servicio **always-on, server-side**. Vive en cloud/PaaS (Railway, Render, Fly) o una VM — o en la infra de la firma si los datos no pueden salir. Debe estar prendido siempre porque el sync y el morning report son programados.
- Puerta de entrada: **bot en WhatsApp** (menor fricción, cero app nueva que adoptar — el equipo ya vive ahí). Ver gotchas en §8.1.
- **NO multi-tenant todavía.** Instancia #0 = un solo despliegue para la firma.

---

## 10. Autonomía (referencia futura — hoy casi todo es L0)

- **L0 (lectura/Q&A):** casi todo Otto en esta fase.
- **Morning report:** L0 programado (lee + postea un digest).
- L1-L3 quedan documentados para cuando se agreguen acciones que escriben. **No se implementan ahora.**
- Cuando llegue ese momento, cada acción se clasifica con 3 preguntas: ¿lee o escribe? ¿reversible? ¿radio de impacto?

---

## 11. Plan de trabajo por fases

> Cada fase produce un artefacto de modelado en `/docs` antes de código.

- **Fase 0 — Fuentes y consultas.** Listar las fuentes (Notion + `[?]`) y las 5-10 consultas/vistas clave que el equipo querría ver. → `/docs/00-fuentes-y-consultas.md`
- **Fase 1 — Modelo de datos del store.** Qué se sincroniza de cada fuente, con qué esquema en Postgres, cada cuánto. → `/docs/01-data-model.md`
- **Fase 2 — Sync pipeline.** Jobs programados fuente → store (empezar con Notion vía API REST).
- **Fase 3 — Capa de consulta.** NL → query (o selección de vista) + el adaptador de modelo. Garantizar la regla dato-vs-presentación.
- **Fase 4 — Display.** Target: **canvas conversacional agent-driven** (UI generativa, ver §3). Empezar con una **librería de componentes + vistas parametrizadas que el LLM compone** — NO NL→SQL abierto (correctness + seguridad); a SQL más abierto se sube después si los datos lo piden. WhatsApp consume la misma capa.
- **Fase 5 — Morning report.** Job programado → DM por persona vía template de WhatsApp (y/o versión linda en Notion).
- **Fase 6 — Observabilidad básica.** Qué se consultó, errores de sync.
- **Generalización:** solo después de que la instancia #0 funcione.

---

## 12. Decisiones abiertas (no asumir)

- ~~**Surface del display.**~~ **RESUELTO:** dos superficies sobre una misma capa de query — **WhatsApp** (ambiente/push) y **web canvas "Jarvis"** agent-driven (UI generativa, §3 corolario). Su construcción se difiere hasta tener la capa de datos, no su visión. Notion = report lindo + conocimiento. Ver §5 / §8.1.
- ~~**Instancia #0.**~~ **RESUELTO:** la **firma AI-first** (`[FIRMA]`). La segunda empresa queda para la fase de generalización, no ahora.
- **Lenguaje del core** (lean: Python).
- **Modelo concreto** (default: Claude, swappable).
- **Fuentes además de Notion.**

---

## 13. Cómo trabajar en Claude Code

1. Mantén este archivo como contexto (referencia desde `CLAUDE.md`).
2. Avanza **fase por fase**. Entregables de modelado (docs) antes de código.

Prompts de arranque:

```
Lee OTTO_CONTEXT.md. No escribas código.
Fase 0: a partir de estas fuentes [Notion + ...], propón las 5-10
consultas/vistas clave que el equipo querría ver cada día, y por qué.
Guárdalo en /docs/00-fuentes-y-consultas.md
```

```
Tomando /docs/00-fuentes-y-consultas.md, diseña el esquema del store en
Postgres: qué se sincroniza de cada fuente, con qué shape, cada cuánto.
Respeta la regla dato-vs-presentación. Guárdalo en /docs/01-data-model.md
```

---

## 14. Anti-patrones (qué NO hacer)

- ❌ Dejar que el LLM calcule o invente números — siempre query determinística contra el store.
- ❌ Consultar Notion en vivo para los dashboards — sincroniza a Postgres.
- ❌ Usar Notion (u otra fuente) como datastore de Otto.
- ❌ Usar el MCP hosted de Notion para lo headless/programado — usa la API REST.
- ❌ Construir acciones que escriben o mutan en esta fase.
- ❌ Construir routing multi-modelo o el framework de config antes de tiempo.
- ❌ Infra multi-tenant ahora.
- ❌ Asistente de escritorio / control local — Otto es server-side, always-on.
- ❌ Clonar `Mark-XXXIX-OR` como base (licencia CC BY-NC + paradigma desktop). Hermes (modelo y framework) descartado por ahora.
