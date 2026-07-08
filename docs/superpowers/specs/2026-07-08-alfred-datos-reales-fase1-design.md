# Alfred — Fase 1: "Consulta datos reales" (diseño)

**Fecha:** 2026-07-08
**Rama:** feat/voice-hud-prototype
**Estado:** aprobado, pendiente de plan de implementación

## Contexto

Alfred (repo `wattson`, dir `otto`) es un asistente de voz con HUD holográfico. Hasta
ahora funcionó en "modo demo": las métricas sociales devolvían datos curados
(`SOCIAL_SHOWCASE=true`) narrados por un guión determinista, y varias integraciones
estaban apagadas o en mock. El producto real es **el HUD (visual) + el cerebro (LLM)
bien seteados como asistente personal** que consulta datos reales. La visión de
WhatsApp/Postgres de `OTTO_CONTEXT.md` es herencia del repo importado (`Jarvis_mvp`) y
**no** es el producto.

Decisión de arquitectura (tomada en brainstorming): **enfoque híbrido**.
- **Fase 1 (este spec):** sacar las muletas de demo y prender integraciones reales
  sobre el router de keywords actual. Entregable real en días.
- **Fase 2 (futuro, fuera de alcance):** migrar a tool-calling (el LLM decide qué
  herramientas llamar).

El cerebro ya quedó resuelto en una sesión previa: OpenAI sin cuota → se migró a
**OpenRouter** (`OPENAI_BASE_URL=https://openrouter.ai/api/v1`,
`OPENAI_MODEL=google/gemini-2.5-flash`). Verificado end-to-end.

## Objetivo

Alfred consulta **datos reales** (métricas sociales, Notion, Gmail/Calendar) sobre el
router actual, y el **LLM narra con esos datos** en vez de guiones fijos.

## Principio rector (no negociable)

Aprendido del showcase, donde datos falsos venían etiquetados como
`isRealData: true`:

1. **Nunca etiquetar mock como real.** Cada respuesta lleva su `dataSource` verdadero.
   Si una fuente cae a mock (cuenta no conectada, API caída), eso se ve — no se finge.
2. **El LLM narra pero no inventa números.** Los widgets/valores salen del resultado
   estructurado de la skill (`tool_call_completed`), no del texto del LLM. Al prompt se
   le pasan los datos reales con instrucción estricta de usar solo esos números.

## Alcance de la Fase 1

### 1. Sacar las muletas de demo
- Eliminar el branch `SOCIAL_SHOWCASE` y `buildShowcaseResponse` en
  `packages/skills/src/social/platformRouter.ts` (líneas ~120-160).
- Sacar `SOCIAL_SHOWCASE=true` del `.env`.
- Sacar la narración determinista: bloque `packages/agent-core/src/agent.ts:246-260`,
  archivo `packages/agent-core/src/narrateSocial.ts` y su test `narrateSocial.test.ts`.
  Los resultados sociales ya se inyectan al prompt vía `toolResultContext`, así que el
  LLM (Gemini) narra con los números reales.
- HUD: quitar/gatear `apps/hud/src/hud/showcaseBoard.ts` y el toggle de spacebar /
  `?showcase=1` en `apps/hud/src/App.tsx`. **No tocar** el render de widgets reales que
  llega por `tool_call_completed` (`apps/hud/src/api/agentClient.ts:115-116`).

### 2. Prender integraciones reales (config + verificación)
- **Zernio (social):** al sacar `SOCIAL_SHOWCASE`, el adaptador real
  (`zernioAdapter.ts:307`) toma el control. `ZERNIO_API_KEY` ya está SET. Validar la API
  real con la key antes de darla por funcional.
- **Notion (todo por Composio — decidido 2026-07-08):** Notion se conecta una sola vez
  vía OAuth en el panel de Composio; **no** se usa `NOTION_API_KEY` cruda ni la API
  directa. Al `.env` solo se agrega `ENABLE_NOTION=true`. `notion_workspace_assistant`
  ya usa Composio. **`notion_project_intelligence` se refactoriza** para consultar por
  Composio en vez del adaptador directo (`notionRealAdapter.ts` / `notionClient.ts`), de
  modo que haya un único mecanismo de conexión. Los IDs de base (`NOTION_TASKS_DATABASE_ID`
  ya SET; falta el de proyectos) siguen siendo necesarios para saber qué bases consultar,
  pero el acceso va por Composio.
- **Gmail/Calendar (Composio):** ya es real (`composioRealAdapter.ts:77`); requiere
  cuentas conectadas en Composio (`COMPOSIO_API_KEY` SET, toolkits
  `notion,gmail,googlecalendar`). Verificar que las cuentas estén conectadas.

### 3. Unificar lectura/escritura
Hoy hay una esquizofrenia: *escribir* correo/evento va a Composio real, pero *leer*
("qué tengo hoy", borradores) devuelve mock hardcodeado.
- Rutear las **lecturas** de calendario (`calendar_lookup`) y Gmail a Composio real.
- Jubilar los skills mock `getUpcomingEvents.mock.ts` y `gmailDraft.mock.ts`.

### 4. Limpieza
- Borrar código muerto no enchufado al router: `instagramAdapter.ts`,
  `tiktokAdapter.ts`, `youtubeAdapter.ts` (adaptadores huérfanos).

### 5. Verificación (crítica, dado el historial de mocks silenciosos)
Por cada integración, manejar una consulta real end-to-end y **confirmar que vuelve
dato real, no mock**, chequeando `dataSource`/`isMock` en el resultado. Ninguna
integración se declara "funciona" sin esta prueba observada.

## Datos/acciones que debe proveer el usuario (bloqueantes de implementación)
- **Composio:** conectar **Notion**, **Gmail** y **Google Calendar** vía OAuth en el
  panel de Composio (app.composio.dev) para el user `default`. Sin estas conexiones, esas
  integraciones caen a mock.
- **Notion:** el `NOTION_PROJECTS_DATABASE_ID` (el de tareas ya está SET; confirmar que
  es correcto).
- **Zernio:** confirmar que hay cuenta con datos accesibles vía la key actual (usuario
  `lucianomusellaa`).

## Fuera de alcance
- Migración a tool-calling / function-calling (Fase 2).
- Wiring de YouTube/Instagram/TikTok reales (se borran como código muerto).
- Slack/GitHub vía Composio (no están en el allowlist; no se agregan ahora).
- Hacer visible el fallback mudo del LLM en el HUD (mejora aparte, no bloqueante).

## Riesgos
- Las APIs reales (Zernio, Notion, Composio) pueden fallar o requerir conexión de
  cuentas que el usuario debe hacer; cada una se verifica antes de declararla lista.
- Quitar la narración determinista traslada al LLM la responsabilidad de no inventar
  números; se mitiga pasando datos estructurados + instrucción estricta y manteniendo
  los widgets como fuente de verdad numérica.
