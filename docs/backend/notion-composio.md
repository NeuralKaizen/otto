# Notion Dedicated Skill via Composio

## Why this exists
Wattson now uses a dedicated Notion skill instead of relying on the generic `/composio/execute?q=...` gateway for Notion prompts.

Benefits:
- explicit action mapping
- predictable read/write behavior
- dedicated health/debug
- approval flow reused without free-text gateway routing

## Environment variables

Required or commonly used:

```env
ENABLE_NOTION=true
NOTION_PROVIDER=composio
NOTION_DEFAULT_PARENT_PAGE_ID=
NOTION_DEFAULT_DATABASE_ID=
NOTION_TASKS_DATABASE_ID=
NOTION_READ_ONLY_MODE=true
NOTION_FALLBACK_TO_MOCK=false

COMPOSIO_API_KEY=
COMPOSIO_USER_ID=
COMPOSIO_READ_ONLY_MODE=true
COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE=true
REQUIRE_APPROVAL=true
```

Notes:
- Canonical enable flag: `ENABLE_NOTION=true`.
- Legacy alias supported: `ENABLE_COMPOSIO_NOTION=true`.
- `NOTION_READ_ONLY_MODE` defaults to `COMPOSIO_READ_ONLY_MODE` if omitted.
- `REQUIRE_APPROVAL` falls back to `COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE` if omitted.
- `NOTION_TASKS_DATABASE_ID` is needed for task-oriented reads and creates.
- `NOTION_DEFAULT_PARENT_PAGE_ID` is needed for creating regular pages.

## Supported prompts

Read:
- `Busca en Notion tareas pendientes`
- `Qué tareas tengo pendientes en Notion`
- `Revisa el estado del proyecto Wattson en Notion`
- `Busca páginas sobre llamadas`
- `Muéstrame mis páginas recientes de Notion`

Write:
- `Crea una página en Notion con este resumen: ...`
- `Guarda esto en Notion`
- `Agrega una tarea en Notion: llamar a Juan mañana`
- `Actualiza la página en Notion con pageId ...`

## How it works

Chat flow:
1. `router.ts` sends explicit Notion prompts to `notion_workspace`.
2. `planner.ts` maps that intent to `notion_workspace_assistant`.
3. `notionWorkspaceSkill.ts` parses the prompt into explicit actions such as:
   - `notion_search`
   - `notion_read_page`
   - `notion_create_page`
   - `notion_create_task`
   - `notion_update_page`
   - `notion_update_task`
4. `notionComposioClient.ts` executes explicit Composio actions instead of using the generic gateway router.

Validated action slugs discovered in the current Composio toolkit:
- `NOTION_SEARCH_NOTION_PAGE`
- `NOTION_FETCH_ROW`
- `NOTION_QUERY_DATABASE`
- `NOTION_CREATE_NOTION_PAGE`
- `NOTION_INSERT_ROW_DATABASE`
- `NOTION_UPDATE_PAGE`

## Read-only and approval behavior

- Read actions execute directly.
- Write actions are blocked when `NOTION_READ_ONLY_MODE=true` or `COMPOSIO_READ_ONLY_MODE=true`.
- Write actions request approval when read-only is off and approval is enabled.
- Approved actions resume with `approved=true` and do not request approval again.

## Health and debug

Endpoints:

```bash
GET /notion/status
GET /health
GET /notion/query?q=Busca%20en%20Notion%20tareas%20pendientes
```

`/notion/status` returns a safe snapshot like:

```json
{
  "enabled": true,
  "provider": "composio",
  "configured": true,
  "composioConfigured": true,
  "defaultParentConfigured": true,
  "tasksDatabaseConfigured": true,
  "readOnlyMode": true,
  "requireApproval": true,
  "lastKnownMode": "real",
  "warnings": []
}
```

No API keys or auth headers are exposed.

## Connecting Notion in Composio

1. Set `COMPOSIO_API_KEY`.
2. Set `COMPOSIO_USER_ID`.
3. Connect the Notion account in Composio for that user.
4. Configure `NOTION_DEFAULT_PARENT_PAGE_ID` and/or `NOTION_TASKS_DATABASE_ID`.
5. Restart the API.

## Troubleshooting

`COMPOSIO_USER_ID` missing:
- `/notion/status` will report `composioConfigured=false`.

Notion not connected in Composio:
- real execution falls back to mock only if `NOTION_FALLBACK_TO_MOCK=true`.

Missing parent page:
- page creation returns a clear error mentioning `NOTION_DEFAULT_PARENT_PAGE_ID`.

Missing tasks database:
- task creation or pending-task reads return a clear error mentioning `NOTION_TASKS_DATABASE_ID`.

Read-only blocking writes:
- turn off `NOTION_READ_ONLY_MODE` only if you want write actions enabled.

Approval pending or expired:
- the write remains unexecuted until the approval is resolved from the WebSocket UI.

Action unavailable upstream:
- `notionComposioClient.ts` tries explicit candidate slugs and fails safely if none work.
