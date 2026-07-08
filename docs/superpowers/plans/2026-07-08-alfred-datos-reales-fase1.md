# Alfred — Fase 1: "Consulta datos reales" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar las muletas de demo de Alfred y hacer que consulte datos reales (métricas sociales, Notion, Gmail/Calendar) sobre el router de keywords actual, con el LLM narrando sobre datos reales.

**Architecture:** Se eliminan tres capas de "demo": el modo showcase de métricas (`SOCIAL_SHOWCASE`), la narración determinista de social (`narrateSocial.ts`) y el tablero showcase del HUD. Se prenden las integraciones reales ya programadas (Zernio directo; Notion y Gmail/Calendar vía Composio) y se unifican lecturas/escrituras de Gmail/Calendar en Composio. Notion pasa 100% por Composio: se refactoriza `notion_project_intelligence` de la API directa a un adapter Composio.

**Tech Stack:** pnpm + Turborepo monorepo; TypeScript ESM; Fastify (api) + Vite/React (hud); `@composio/core` SDK; Zernio REST; Vitest para tests; OpenRouter/Gemini como LLM.

## Global Constraints

- **Nunca etiquetar mock como real.** Toda respuesta lleva su `dataSource`/`isMock` verdadero; si una fuente cae a mock, se refleja. (El showcase violaba esto con `isRealData: true` sobre datos falsos.)
- **El LLM narra pero NO inventa números.** Los valores/widgets salen del resultado estructurado de la skill; el prompt instruye explícitamente usar solo esos datos.
- **ESM:** todos los imports internos llevan extensión `.js` (aunque el archivo sea `.ts`).
- **Español neutro cálido** en cualquier texto visible (sin voseo).
- **Commits frecuentes**, uno por task como mínimo.
- **Verificación real:** ninguna integración se declara funcional sin observar dato real end-to-end (patrón probe vía `/chat` + WebSocket, no solo typecheck).
- Comandos desde la raíz `/home/newral/Lucianos/otto`. Typecheck de un paquete: `pnpm --filter @wattson/<pkg> exec tsc --noEmit`. Tests: `pnpm --filter @wattson/<pkg> test`.

---

## File Structure

- `packages/skills/src/social/platformRouter.ts` — quitar branch showcase + `buildShowcaseResponse`.
- `packages/agent-core/src/agent.ts` — quitar bloque de narración determinista social (246-260) y su import.
- `packages/agent-core/src/narrateSocial.ts` + `narrateSocial.test.ts` — borrar.
- `packages/agent-core/src/promptBuilder.ts` — agregar guardia "no inventes números".
- `apps/hud/src/hud/showcaseBoard.ts` — borrar; `apps/hud/src/App.tsx` — quitar toggle/`?showcase=1`.
- `packages/agent-core/src/router.ts` + `planner.ts` — rutear lecturas de calendario a Composio.
- `packages/skills/src/social/adapters/{instagramAdapter,tiktokAdapter,youtubeAdapter}.ts` — borrar (código muerto).
- **Nuevo:** `packages/skills/src/notion/adapters/notionComposioQueryAdapter.ts` — consulta tareas/proyectos vía Composio.
- `packages/skills/src/notion/notionProjectSkill.ts` + `notionConfig.ts` — usar el adapter Composio.
- `.env` — flags.

---

### Task 1: Matar el modo showcase de métricas (backend)

**Files:**
- Modify: `packages/skills/src/social/platformRouter.ts` (borrar líneas 117-162: comentario, `buildShowcaseResponse`, y el `if (process.env.SOCIAL_SHOWCASE...)`)
- Modify: `.env` (quitar `SOCIAL_SHOWCASE=true`, línea 64-65)

**Interfaces:**
- Produces: `routePlatformRequest(request)` sin cortocircuito showcase; siempre pasa por `fetchOne` (Zernio real o mock honesto).

- [ ] **Step 1: Buscar tests que dependan del showcase**

Run: `grep -rn "SOCIAL_SHOWCASE\|buildShowcaseResponse" packages apps --include=*.ts`
Expected: solo referencias en `platformRouter.ts` (y quizá un test). Si hay un test que fija el comportamiento showcase, se borra en este task.

- [ ] **Step 2: Borrar el cortocircuito showcase**

En `packages/skills/src/social/platformRouter.ts`, borrar el bloque de comentario + función `buildShowcaseResponse` (líneas 117-157) y estas líneas al inicio de `routePlatformRequest` (159-162):

```ts
export async function routePlatformRequest(request: SocialMetricsRequest): Promise<SocialMetricsResponse> {
  if (process.env.SOCIAL_SHOWCASE === "true") {
    return buildShowcaseResponse(request);
  }

  const config = getSocialConfig();
```

Queda:

```ts
export async function routePlatformRequest(request: SocialMetricsRequest): Promise<SocialMetricsResponse> {
  const config = getSocialConfig();
```

- [ ] **Step 3: Quitar el flag del `.env`**

Borrar del `.env` las líneas:
```
# Video demo: métricas curadas coherentes (voz + tablero)
SOCIAL_SHOWCASE=true
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @wattson/skills exec tsc --noEmit`
Expected: exit 0. Si `SocialMetricsRequest` quedó sin uso en imports, quitarlo.

- [ ] **Step 5: Commit**

```bash
git add packages/skills/src/social/platformRouter.ts .env
git commit -m "feat(social): quitar modo showcase — métricas siempre reales o mock honesto"
```

---

### Task 2: Rutear la respuesta social por el LLM (quitar narración determinista)

**Files:**
- Modify: `packages/agent-core/src/agent.ts` (quitar import línea 14 y bloque 246-260)
- Delete: `packages/agent-core/src/narrateSocial.ts`, `packages/agent-core/src/narrateSocial.test.ts`
- Modify: `packages/agent-core/src/promptBuilder.ts` (guardia anti-invención)

**Interfaces:**
- Consumes: `toolResultContext` (ya devuelto por `executePlan`) que contiene el resultado social estructurado y se concatena al prompt en `agent.ts:265` `buildPrompt(input.userMessage + toolResultContext, ...)`.
- Produces: para `social_metrics_lookup`, Alfred narra vía `provider.streamChat` con los datos reales en el prompt; los widgets siguen emitiéndose por `tool_call_completed` dentro de `executePlan` (no se tocan).

- [ ] **Step 1: Confirmar que el resultado social llega al prompt**

Run: `grep -n "toolResultContext" packages/agent-core/src/agent.ts packages/agent-core/src/executor.ts`
Expected: `executePlan` arma `toolResultContext` con el resultado de la skill; `agent.ts:265` lo concatena. Confirma que la data social entra al prompt sin la narración determinista.

- [ ] **Step 2: Borrar el bloque de narración determinista**

En `packages/agent-core/src/agent.ts`, borrar el bloque completo `if (executedSkillName === "social_metrics_lookup") { ... }` (líneas 246-260, el que llama `narrateSocialMetrics` y hace `return` temprano). Borrar también el import de la línea 14:

```ts
import { narrateSocialMetrics } from "./narrateSocial.js";
```

- [ ] **Step 3: Borrar los archivos de narración**

```bash
git rm packages/agent-core/src/narrateSocial.ts packages/agent-core/src/narrateSocial.test.ts
```

- [ ] **Step 4: Agregar guardia anti-invención al prompt**

Leer `packages/agent-core/src/promptBuilder.ts` y localizar el system prompt base. Agregar esta instrucción al system prompt (texto exacto):

```
Cuando la respuesta incluya datos de una herramienta (métricas, tareas, correos, eventos), usá EXCLUSIVAMENTE los números y hechos provistos en el contexto de la herramienta. Nunca inventes ni estimes cifras. Si un dato no está, decílo con naturalidad en vez de completarlo.
```

- [ ] **Step 5: Typecheck + tests del paquete**

Run: `pnpm --filter @wattson/agent-core exec tsc --noEmit && pnpm --filter @wattson/agent-core test`
Expected: exit 0; ningún test referencia `narrateSocial` (si alguno lo hacía, se borró en Step 3).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src
git commit -m "feat(agent): social narrado por el LLM con datos reales; quita narración determinista"
```

---

### Task 3: Quitar el tablero showcase del HUD

**Files:**
- Delete: `apps/hud/src/hud/showcaseBoard.ts`
- Modify: `apps/hud/src/App.tsx` (quitar import de showcaseBoard, el toggle de spacebar y el parsing de `?showcase=1`/`?hud=`)

**Interfaces:**
- Produces: el HUD solo renderiza widgets reales que llegan por `tool_call_completed` (`apps/hud/src/api/agentClient.ts:115-116`) — sin datos curados de demo.

- [ ] **Step 1: Mapear los usos del showcase en el HUD**

Run: `grep -rn "showcaseBoard\|SHOWCASE_WIDGETS\|SHOWCASE_CAPTION\|showcase" apps/hud/src`
Expected: `showcaseBoard.ts` + referencias en `App.tsx`. Anotar cada línea a tocar.

- [ ] **Step 2: Quitar el toggle y el parsing de query en App.tsx**

En `apps/hud/src/App.tsx`, quitar: el import de `showcaseBoard`, el handler de spacebar que activa showcase, y la lectura de `?showcase=1`/`?hud=<state>` (bloque ~líneas 20-84). El resto del render (widgets desde el estado de sesión real) queda intacto.

- [ ] **Step 3: Borrar el módulo showcase**

```bash
git rm apps/hud/src/hud/showcaseBoard.ts
```

- [ ] **Step 4: Typecheck + build del HUD**

Run: `pnpm --filter @wattson/hud exec tsc --noEmit`
Expected: exit 0, sin referencias colgadas a `showcaseBoard`.

- [ ] **Step 5: Commit**

```bash
git add apps/hud/src
git commit -m "feat(hud): quitar tablero showcase de demo; solo widgets reales"
```

---

### Task 4: Unificar lecturas de Gmail/Calendar en Composio real

**Files:**
- Modify: `packages/agent-core/src/router.ts` (que "qué tengo hoy / agenda / eventos" caiga en `external_tool_query` en vez de `calendar_lookup`)
- Modify: `packages/agent-core/src/planner.ts` (quitar la entrada `calendar_lookup`/`gmail_draft` si dejan de usarse, o dejar `calendar_lookup` apuntando a Composio)
- Delete: `packages/skills/src/calendar/getUpcomingEvents.mock.ts`, `packages/skills/src/gmail/gmailDraft.mock.ts`
- Modify: `packages/skills/src/registry.ts` (quitar el registro de los skills mock borrados)

**Interfaces:**
- Consumes: `composio_tool_gateway` (skill ya existente, `external_tool_query`) que ya hace lectura real de Gmail y Calendar vía Composio (`composioRealAdapter.ts:77`).
- Produces: lecturas de calendario y correo van a Composio real; se retiran los skills mock.

- [ ] **Step 1: Ver cómo el router decide calendar vs external_tool_query**

Run: `grep -n "calendar_lookup\|external_tool_query\|calendario\|agenda\|eventos" packages/agent-core/src/router.ts`
Expected: hay un branch `calendar_lookup` (keywords calendario/agenda/eventos/qué tengo) y branches de calendar-write que ya van a `external_tool_query`. Objetivo: que las lecturas de calendario también devuelvan `external_tool_query`.

- [ ] **Step 2: Rutear lecturas de calendario a Composio**

En `packages/agent-core/src/router.ts`, mover las keywords de lectura de calendario (`calendario`, `agenda`, `eventos`, `reuniones`, `qué tengo`) al mismo intent `external_tool_query` que ya usan las escrituras de calendario. Eliminar el branch que devuelve `calendar_lookup`. (Gmail-read ya va a `external_tool_query`; gmail_draft se retira porque las escrituras reales van por Composio con aprobación.)

- [ ] **Step 3: Limpiar el planner**

En `packages/agent-core/src/planner.ts`, quitar las entradas `calendar_lookup` (líneas 9-13) y `gmail_draft` (14-18) de `PLAN_BY_INTENT` **solo si** `router.ts` ya no las devuelve. Verificar que `Intent` (en `@wattson/shared`) siga teniendo esos miembros o quitarlos también si el tipo lo permite sin romper otros usos (`grep -rn "calendar_lookup\|gmail_draft" packages`).

- [ ] **Step 4: Borrar los skills mock y su registro**

```bash
git rm packages/skills/src/calendar/getUpcomingEvents.mock.ts packages/skills/src/gmail/gmailDraft.mock.ts
```
En `packages/skills/src/registry.ts`, quitar los imports y el registro de `getUpcomingEvents` y `gmailDraftMock`.

- [ ] **Step 5: Typecheck de ambos paquetes**

Run: `pnpm --filter @wattson/agent-core exec tsc --noEmit && pnpm --filter @wattson/skills exec tsc --noEmit`
Expected: exit 0. Resolver cualquier referencia colgante a los intents/skills borrados.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src packages/skills/src
git commit -m "feat(tools): lecturas de Gmail/Calendar por Composio real; retira skills mock"
```

---

### Task 5: Refactorizar `notion_project_intelligence` para consultar vía Composio

**Files:**
- Create: `packages/skills/src/notion/adapters/notionComposioQueryAdapter.ts`
- Modify: `packages/skills/src/notion/notionProjectSkill.ts` (usar el nuevo adapter y su gate)
- Modify: `packages/skills/src/notion/notionConfig.ts` (gate de disponibilidad basado en Composio, no en `NOTION_API_KEY`)
- Test: `packages/skills/src/notion/adapters/notionComposioQueryAdapter.test.ts`

**Interfaces:**
- Consumes:
  - `notionRealAdapter` interface (a replicar): `queryTasks(request): Promise<NormalizedNotionTask[]>` y `queryProjects(request): Promise<NormalizedNotionProject[]>` — ver `packages/skills/src/notion/adapters/notionRealAdapter.ts` para firmas y normalización exactas.
  - El cliente Composio de Notion: `packages/skills/src/notion/notionComposioClient.ts` (usa `client.tools.execute(actionSlug, {...})`, línea ~359, con slugs tipo `NOTION_QUERY_DATABASE`/`NOTION_FETCH_DATABASE`). Reutilizar ese cliente para no duplicar auth.
  - Config Composio: `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`, `NOTION_TASKS_DATABASE_ID`, `NOTION_PROJECTS_DATABASE_ID` (vía `getNotionConfig()` / `getNotionWorkspaceConfig()`).
- Produces: `notionComposioQueryAdapter` con la MISMA interface que `notionRealAdapter` (`queryTasks`, `queryProjects`), consumible sin cambios por `notionProjectSkill.ts`. Nueva función de gate `isNotionComposioQueryAvailable(config?)` en `notionConfig.ts`.

- [ ] **Step 1: Leer los patrones existentes**

Leer completos: `packages/skills/src/notion/adapters/notionRealAdapter.ts` (interface objetivo + cómo normaliza filas a `NormalizedNotionTask`/`NormalizedNotionProject`), `packages/skills/src/notion/notionComposioClient.ts` (cómo ejecuta acciones y parsea la respuesta de Composio), y `packages/skills/src/notion/notionNormalizer.ts`. El adapter Composio debe producir exactamente los mismos tipos normalizados.

- [ ] **Step 2: Escribir el test que falla**

Test: `packages/skills/src/notion/adapters/notionComposioQueryAdapter.test.ts`. Mockear el cliente Composio para devolver una fila cruda de una DB de Notion y verificar que `queryTasks` la normaliza a `NormalizedNotionTask`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../notionComposioClient.js", () => ({
  executeNotionComposioAction: vi.fn(async () => ({
    // forma mínima de una respuesta NOTION_QUERY_DATABASE (ajustar a la real observada en Step 1)
    results: [
      {
        id: "task-1",
        properties: {
          Name: { title: [{ plain_text: "Escribir spec" }] },
          Status: { status: { name: "En progreso" } },
          Due: { date: { start: "2020-01-01" } },
          Assignee: { people: [{ name: "Luciano" }] },
        },
      },
    ],
  })),
}));

import { notionComposioQueryAdapter } from "./notionComposioQueryAdapter.js";

describe("notionComposioQueryAdapter", () => {
  it("normaliza una fila de Notion a NormalizedNotionTask", async () => {
    const tasks = await notionComposioQueryAdapter.queryTasks({ intent: "workspace_overview" } as any);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Escribir spec");
    expect(tasks[0].assignees).toContain("Luciano");
    expect(tasks[0].isOverdue).toBe(true); // Due 2020 < hoy
  });
});
```

> Nota: el nombre `executeNotionComposioAction` y la forma exacta de `results` deben ajustarse a lo que `notionComposioClient.ts` realmente exporta/devuelve (Step 1). Si el cliente expone otra función, mockear esa.

- [ ] **Step 3: Correr el test — debe fallar**

Run: `pnpm --filter @wattson/skills test notionComposioQueryAdapter`
Expected: FAIL — módulo `notionComposioQueryAdapter` no existe.

- [ ] **Step 4: Implementar el adapter**

Crear `packages/skills/src/notion/adapters/notionComposioQueryAdapter.ts`. Debe:
1. Importar el cliente Composio de `../notionComposioClient.js` y la normalización de `../notionNormalizer.js` (reutilizar exactamente los helpers que usa `notionRealAdapter.ts`).
2. Exportar un objeto con la interface de `notionRealAdapter`:

```ts
import type { NotionProjectIntelligenceRequest } from "../types.js";
import type { NormalizedNotionTask, NormalizedNotionProject } from "../types.js";
import { getNotionConfig } from "../notionConfig.js";
// importar el ejecutor real de acciones Composio y los normalizadores identificados en Step 1

async function queryTasks(request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionTask[]> {
  const cfg = getNotionConfig();
  const raw = await executeNotionComposioAction("NOTION_QUERY_DATABASE", {
    database_id: cfg.tasksDatabaseId,
  });
  return normalizeTasks(raw.results, cfg.taskProperties); // reutilizar el normalizador de notionRealAdapter
}

async function queryProjects(request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionProject[]> {
  const cfg = getNotionConfig();
  const raw = await executeNotionComposioAction("NOTION_QUERY_DATABASE", {
    database_id: cfg.projectsDatabaseId,
  });
  return normalizeProjects(raw.results, cfg.projectProperties);
}

export const notionComposioQueryAdapter = { queryTasks, queryProjects };
```

> El slug exacto (`NOTION_QUERY_DATABASE` vs `NOTION_FETCH_DATABASE`) y el shape de `raw` se confirman en Step 1 contra `notionComposioClient.ts`. Reutilizar los mismos normalizadores que `notionRealAdapter.ts` para no divergir en el mapeo de propiedades.

- [ ] **Step 5: Agregar el gate en notionConfig.ts**

En `packages/skills/src/notion/notionConfig.ts`, agregar:

```ts
/** True cuando Notion está habilitado y Composio está configurado (sin requerir NOTION_API_KEY cruda). */
export function isNotionComposioQueryAvailable(config: NotionConfig = getNotionConfig()): boolean {
  const ws = getNotionWorkspaceConfig();
  return config.enabled && ws.composioConfigured;
}
```

- [ ] **Step 6: Cablear el skill al adapter Composio**

En `packages/skills/src/notion/notionProjectSkill.ts`:
- Cambiar el import: `import { notionComposioQueryAdapter } from "./adapters/notionComposioQueryAdapter.js";` en vez de `notionRealAdapter`.
- En `loadTasks` (línea 45-64): reemplazar `isNotionTasksAvailable()` por `isNotionComposioQueryAvailable() && Boolean(getNotionConfig().tasksDatabaseId)` y `notionRealAdapter.queryTasks` por `notionComposioQueryAdapter.queryTasks`.
- En `loadProjects` (línea 66-85): análogo con `projectsDatabaseId` y `notionComposioQueryAdapter.queryProjects`.
- Actualizar el import de gates en la línea 11 y el `buildClarificationResponse` (línea 199) que usa `isNotionTasksAvailable`/`isNotionProjectsAvailable`.

- [ ] **Step 7: Correr el test — debe pasar**

Run: `pnpm --filter @wattson/skills test notionComposioQueryAdapter`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @wattson/skills exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/skills/src/notion
git commit -m "feat(notion): project intelligence consulta vía Composio (sin NOTION_API_KEY directa)"
```

---

### Task 6: Borrar adaptadores sociales muertos

**Files:**
- Delete: `packages/skills/src/social/adapters/instagramAdapter.ts`, `tiktokAdapter.ts`, `youtubeAdapter.ts`

**Interfaces:**
- Estos archivos NO están importados por `platformRouter.ts` (que solo usa `zernioAdapter.js` y `mockSocialAdapter.js`). Borrarlos no afecta el flujo real.

- [ ] **Step 1: Confirmar que están huérfanos**

Run: `grep -rn "from.*adapters/instagramAdapter\|from.*adapters/tiktokAdapter\|from.*adapters/youtubeAdapter" packages apps --include=*.ts`
Expected: sin resultados fuera de los propios archivos/tests. Si algún test los importa, borrar ese test también.

- [ ] **Step 2: Borrar**

```bash
git rm packages/skills/src/social/adapters/instagramAdapter.ts packages/skills/src/social/adapters/tiktokAdapter.ts packages/skills/src/social/adapters/youtubeAdapter.ts
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wattson/skills exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/src/social/adapters
git commit -m "chore(social): borrar adaptadores instagram/tiktok/youtube huérfanos"
```

---

### Task 7: Flags del `.env` y verificación end-to-end real

**Files:**
- Modify: `.env` (`ENABLE_NOTION=true`, `ZERNIO_FALLBACK_TO_MOCK=false`, `ENABLE_VOICE=true`, `NOTION_PROJECTS_DATABASE_ID=<del usuario>`)
- Create (temporal, scratchpad): script probe de verificación

**Interfaces:**
- Consumes: API corriendo (`pnpm dev:api` en :4000) + `/chat` (campo `message`) + WebSocket `/ws`.

- [ ] **Step 1: Ajustar flags del `.env`**

Agregar/editar en `.env`:
```
ENABLE_NOTION=true
NOTION_PROJECTS_DATABASE_ID=<pegar el id de la base de proyectos que dé el usuario>
```
Cambiar:
```
ZERNIO_FALLBACK_TO_MOCK=false
ENABLE_VOICE=true
```

- [ ] **Step 2: Verificar Zernio directo (sin levantar todo)**

Con `SOCIAL_DEFAULT_USERNAME=lucianomusellaa` y `ZERNIO_API_KEY` seteada, pegarle a la API real de Zernio (patrón del `zernioAdapter.ts:307`) con curl para confirmar 200 + datos. Si da error de plan/cuenta, anotarlo como limitación honesta (no falsear).

- [ ] **Step 3: Levantar la API y probar cada intent real**

Run: `pnpm dev:api` (background) y esperar `Server listening`. Usar un probe (Node, global `WebSocket`) que haga `POST /chat` con `{message}` y capture la respuesta por WS, para cada caso:
- Social: `"Alfred, mis métricas de instagram"` → confirmar `dataSource: "zernio"` (real) y que el texto NO tiene números inventados fuera de los widgets.
- Notion: `"¿qué tareas vencidas hay?"` → confirmar que responde de Notion real (no el `MOCK_LABEL` "datos simulados").
- Calendar: `"¿qué tengo hoy en la agenda?"` → confirmar que va a Composio (no el mock borrado).
- Conversación: `"contame un chiste"` → confirmar respuesta LLM real (provider `openai/google/gemini-2.5-flash`).

Expected: cada uno devuelve dato real o una limitación honesta; ninguno inventa. Para las integraciones que dependan de cuentas Composio no conectadas aún, documentar el estado (cae a "unavailable"/mock etiquetado, nunca a fake-como-real).

- [ ] **Step 4: Apagar la API de prueba**

Run: `fuser -k 4000/tcp`

- [ ] **Step 5: Commit**

```bash
git add .env
git commit -m "chore(env): prende Notion, apaga fallback mudo de Zernio, corrige ENABLE_VOICE"
```

> Nota: `.env` puede estar gitignoreado. Si `git add .env` no lo toma, dejar los cambios locales y anotar en el PR/handoff qué flags cambiaron (sin exponer secretos).

---

## Self-Review

- **Cobertura del spec:** showcase backend (T1) ✓; narración determinista → LLM + guardia anti-invención (T2) ✓; showcase HUD (T3) ✓; unificar lectura/escritura Gmail-Calendar (T4) ✓; Notion 100% Composio con refactor de project-intelligence (T5) ✓; borrar código muerto (T6) ✓; flags + verificación real por integración (T7) ✓.
- **Bloqueantes del usuario** (Composio OAuth de Notion/Gmail/Calendar, id de base de proyectos, confirmación Zernio) están aislados en T7, que es donde se verifica; T1-T6 no dependen de ellos.
- **Consistencia de tipos:** el nuevo `notionComposioQueryAdapter` replica la interface de `notionRealAdapter` (`queryTasks`/`queryProjects` → `NormalizedNotionTask[]`/`NormalizedNotionProject[]`), consumida sin cambios por `notionProjectSkill.ts`. El gate `isNotionComposioQueryAvailable` reemplaza a `isNotionTasksAvailable/ProjectsAvailable` en el skill.
- **Riesgo señalado:** los slugs/shape de la acción Composio de Notion (T5) se confirman leyendo `notionComposioClient.ts` en el Step 1 del task; el test se ajusta a la forma real observada.
```
