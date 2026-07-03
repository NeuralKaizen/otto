# Wattson OS — Session Context

## Status
Fases 1-11 completas. `pnpm typecheck` 8/8 PASS. Repo en checkpoint estable.
Composio from Chat: routing mejorado, ToolCallCard con Composio meta, system prompt actualizado, /composio/status con warnings, README "Composio from Chat" section.
Notion dedicated skill en progreso/validación: parser propio, cliente Composio directo, `/notion/status`, routing dedicado, tests iniciales.

## Right now
Notion dedicated skill implementada y en validación final.

## Fase 13 — Notion Dedicated Skill via Composio (en validación, 2026-06-17)
- **Nueva skill**: `notion_workspace_assistant` con acciones explícitas `notion_search`, `notion_read_page`, `notion_create_page`, `notion_create_task`, `notion_update_page`, `notion_update_task`.
- **Nuevo parser**: `packages/skills/src/notion/notionActionParser.ts` separa acciones de Notion del gateway genérico.
- **Nuevo cliente**: `packages/skills/src/notion/notionComposioClient.ts` llama a Composio con action slugs explícitos, sin pasar por `/composio/execute?q=...`.
- **Config/health**: `notionConfig.ts` ahora expone `getNotionWorkspaceConfig()`, `validateNotionWorkspaceConfig()`, runtime state y warnings seguros. API expone `/notion/status` y añade bloque `notion` en `/health`.
- **Routing**: prompts explícitos de Notion van a `notion_workspace` antes que al gateway genérico. Queries genéricas de proyecto/tareas sin “Notion” siguen pudiendo usar `notion_project_intelligence`.
- **UI**: `ToolCallCard.tsx` muestra meta clara para la skill dedicada de Notion (acción, modo, riesgo, bloqueo/approval).
- **Tests nuevos**:
  - `packages/skills/src/notion/notionWorkspaceSkill.test.ts`
  - `apps/api/src/routes/notion.routes.test.ts`
  - `router.test.ts` actualizado para verificar que Notion explícito no use el gateway genérico.
- **Docs**: `docs/notion-composio.md` documenta env vars, prompts, health, read-only, approvals y troubleshooting.

## Fase 11 — Composio from Chat (completa, 2026-06-17)
- **router.ts**: Gmail con keyword "gmail" o frases de lectura específicas ("busca mis correos", "últimos correos", etc.) → `external_tool_query`. Calendar write ("crea un evento", "agenda una reunión") → `external_tool_query` (antes del check de `calendar_lookup`). GitHub writes ("crea un issue", "abre un issue", "issues abiertos") → `external_tool_query`.
- **router.test.ts**: 7 nuevos test cases cubriendo routing Fase 11 (A-G).
- **composioSkill.test.ts** (NUEVO en packages/skills/src/composio/): tests A-H de política + parser (Gmail read, Gmail write approval, read-only block, calendar read, notion write, approved execution, rejection, streaming compat).
- **ToolCallCard.tsx**: sección Composio con toolkit label, action, mode badge (Real/Mock/Blocked/Approval required), risk badge, summary truncado, limitation note. Icons Globe + Lock + ShieldAlert.
- **systemPrompt.ts**: nueva sección "Herramientas externas via Composio" explicando comportamiento mock vs real, cómo interpretar blocked/requiresApproval, cuándo aparece el approval modal.
- **composio.routes.ts**: `/composio/status` ahora incluye `warnings[]` (sin secretos: falta API key, READ_ONLY activo, falta userId, requireApproval activo), `requireApprovalForWrite`, `configured.hasUserId`.
- **README.md**: nueva sección "Composio from Chat" con prompts de ejemplo, flujo approve/reject, real vs mock, vars de entorno, tabla de troubleshooting.

## Fase 10 — Composio Real Validation + Structured Parser (completa)
- `composioParser.ts` reescrito: detección de toolkit en 3 capas (strong/weak/generic), detección de riesgo de acción por patrones de verbo, extracción de parámetros (dateRange, statusFilter, personName, projectName, senderName, recipientName, subject, repoName, eventType, limit). Exports: `parseComposioQuery()` → `ParsedComposioQuery`, `toToolRequest()`, `parseComposioRequest()`.
- `composioRealAdapter.ts` reescrito: `logComposioCall()` seguro (nunca imprime API key), `classifyError()` duck-typing sin instanceof, `checkConnectedAccounts()` para `/composio/status`.
- Normalizers mejorados: `notionNormalizer` (status tipo "status"/"select", assignee multiple, rollup project), `gmailNormalizer` (messages+drafts), `calendarNormalizer` (dateTime/date, attendees).
- `composioSkill.ts`: `buildFilterDescription()` → frases en español, `formatResultLines` con listas numeradas enriquecidas, fuente explícita "Fuente: Composio mock/real.", mensaje específico para `connected_account_not_found`.
- `composioMockAdapter.ts`: mock data Notion con Status tipo "status" + rollup Proyectos.
- `composioToolRegistry.ts`: `findActionForRisk()` + `nonReadActions()`.
- `GET /composio/status`: shape `{enabled, mode, readOnly, userId, allowedToolkits, realAdapterAvailable, configured:{hasApiKey}, connectedAccountsCheck}` — nunca expone API key.
- `.env`: bloque Composio completo con `COMPOSIO_API_KEY` vacío.

## Tests verificados (sesión actual)
- **A** ✅ `/composio/status` → shape exacto, sin secretos
- **B** ✅ `/composio/execute?q=Busca en Notion...` → summary con filtros detectados, lista numerada, fuente mock
- **C** ✅ Parser estructurado — 6 prompts clasificados correctamente
- **D** ✅ Read-only block → `blocked:true`, `requiresApproval:false`, mensaje modo solo lectura
- **E** ✅ `COMPOSIO_READ_ONLY_MODE=false` → execute() devuelve `requiresApproval:true`, no ejecuta nada
- **F** ✅ Streaming intacto — 230 `message_delta` events, `message_done` correcto
- **G** ✅ Gmail draft approval intacto — `approval_requested` event emitido correctamente

## Next up (Fase 12 — elegir una)
- [ ] Validar los action slugs exactos de lectura detallada de página contra una cuenta real de Composio/Notion
- [ ] Mejorar `notion_read_page` para contenido completo si el slug `retrieve/get page` difiere upstream
- [ ] Añadir resolución de target por título para `update_page`/`update_task` cuando no haya `pageId`
- [ ] Expandir listados recientes usando database/default parent según el schema real del workspace
- [ ] Bundle API como Tauri sidecar (apps/desktop/)
- [ ] ElevenLabs TTS (packages/voice/)
- [ ] Ollama local LLM provider (packages/agent-core/src/model/)
- [ ] Instagram/TikTok adapters reales (cuando se autorice)
- [ ] WebSocket auth (session tokens)
- [ ] Revisar cap de 100 registros/DB (notionClient.ts MAX_RESULTS) si el workspace supera ese tamaño
- [ ] Validar el adaptador real de Composio contra una cuenta real (requiere COMPOSIO_API_KEY configurada — ver README "Composio Real Validation")
- [ ] Extender el patrón de detección de "Notion write" del router a Gmail/Calendar si se enrutan por Composio
- [ ] Automated tests con Vitest

## Gotchas
- packages/memory/.env requiere su propio DATABASE_URL para Prisma
- Nunca loguear OPENAI_API_KEY ni NOTION_API_KEY ni COMPOSIO_API_KEY
- Mock-first, approval-first — no romper streaming/cancelación/desktop
- .env: mapeo de propiedades Notion específico del workspace — actualizar si cambia el schema en Notion
- "Progreso" es fórmula Notion 0-1 (Percent) — normalizeProgressValue() en notionRealAdapter.ts la pasa a 0-100
- Intent "workspace_overview" (notionParser.ts) es el default para queries no clasificadas dentro de notion_project_intelligence
- Composio: ENABLE_COMPOSIO=false (default) → mock; COMPOSIO_READ_ONLY_MODE=true (default) bloquea escritura/envío/borrado sin aprobación; con COMPOSIO_READ_ONLY_MODE=false, write/send/delete pasan por el flujo de aprobación dinámico (Fase 9)
- composio_tool_gateway.preflight() es el mecanismo de aprobación dinámica — devuelve {status:"requires_approval", approvalRequest, pendingExecution} solo para acciones permitidas que necesitan aprobación; todo lo demás (bloqueado, ya aprobado, lectura) devuelve {status:"proceed"} y execute() lo maneja como siempre
- approvalRegistry.ts (agent-core) es un Map en memoria con TTL (APPROVAL_TIMEOUT_MS, default 5min) — solo guarda approvalRequest/pendingExecution sanitizados, nunca secretos
- La nueva skill dedicada de Notion no usa el router genérico de `/composio/execute?q=...`; usa parsing y action mapping propios sobre el SDK de Composio
