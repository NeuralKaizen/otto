import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { notionWorkspaceSkill } from "./notionWorkspaceSkill.js";
import { resetNotionRuntimeState } from "./notionConfig.js";

const ENV_KEYS = [
  "ENABLE_NOTION",
  "ENABLE_COMPOSIO",
  "ENABLE_COMPOSIO_NOTION",
  "NOTION_PROVIDER",
  "NOTION_DEFAULT_PARENT_PAGE_ID",
  "NOTION_DEFAULT_DATABASE_ID",
  "NOTION_TASKS_DATABASE_ID",
  "NOTION_READ_ONLY_MODE",
  "NOTION_FALLBACK_TO_MOCK",
  "REQUIRE_APPROVAL",
  "COMPOSIO_API_KEY",
  "COMPOSIO_USER_ID",
  "COMPOSIO_READ_ONLY_MODE",
  "COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE",
] as const;

const savedEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  savedEnv.set(key, process.env[key]);
}

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  for (const [key, value] of savedEnv.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetNotionRuntimeState();
});

test("Fase 13 B: Notion search prompt usa la skill dedicada en modo read/search sin approval", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_FALLBACK_TO_MOCK: "true",
    COMPOSIO_READ_ONLY_MODE: "true",
    NOTION_READ_ONLY_MODE: "true",
    NOTION_TASKS_DATABASE_ID: "tasks-db-123",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Busca en Notion tareas pendientes" },
    {}
  );

  assert.equal(result.action, "notion_search");
  assert.equal(result.risk, "read");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.blocked, false);
  assert.ok(result.summary.includes("Consulté Notion"));
});

test("Fase 13 C: Notion create page requiere approval cuando write está habilitado", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_DEFAULT_PARENT_PAGE_ID: "parent-page-123",
    NOTION_READ_ONLY_MODE: "false",
    COMPOSIO_READ_ONLY_MODE: "false",
    REQUIRE_APPROVAL: "true",
    NOTION_FALLBACK_TO_MOCK: "true",
  });

  const preflight = await notionWorkspaceSkill.preflight?.(
    { message: "Crea una página en Notion con el resumen de esta conversación" },
    {}
  );
  assert.deepEqual(preflight?.status, "requires_approval");

  const result = await notionWorkspaceSkill.execute(
    { message: "Crea una página en Notion con el resumen de esta conversación" },
    {}
  );

  assert.equal(result.action, "notion_create_page");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.source, "none");
});

test("Fase 13 D: Notion create page queda bloqueado en read-only sin approval", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_DEFAULT_PARENT_PAGE_ID: "parent-page-123",
    NOTION_READ_ONLY_MODE: "true",
    COMPOSIO_READ_ONLY_MODE: "true",
    REQUIRE_APPROVAL: "true",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Crea una página en Notion con este resumen" },
    {}
  );

  assert.equal(result.blocked, true);
  assert.equal(result.requiresApproval, false);
  assert.match(result.summary, /solo lectura/i);
});

test("Fase 13 E: approval ejecuta la acción una sola vez cuando approved=true", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_DEFAULT_PARENT_PAGE_ID: "parent-page-123",
    NOTION_READ_ONLY_MODE: "false",
    COMPOSIO_READ_ONLY_MODE: "false",
    REQUIRE_APPROVAL: "true",
    NOTION_FALLBACK_TO_MOCK: "true",
  });

  const preflight = await notionWorkspaceSkill.preflight?.(
    { message: "Crea una página en Notion con este resumen", approved: true },
    {}
  );
  assert.deepEqual(preflight?.status, "proceed");

  const result = await notionWorkspaceSkill.execute(
    { message: "Crea una página en Notion con este resumen", approved: true },
    {}
  );

  assert.equal(result.blocked, false);
  assert.equal(result.requiresApproval, false);
  assert.ok(result.source === "mock" || result.source === "composio_api");
});

test("Fase 13 F: missing config devuelve error claro sin crashear", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_READ_ONLY_MODE: "false",
    COMPOSIO_READ_ONLY_MODE: "false",
    REQUIRE_APPROVAL: "false",
    NOTION_FALLBACK_TO_MOCK: "false",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Crea una página en Notion con este resumen" },
    {}
  );

  assert.equal(result.source, "none");
  assert.match(result.summary, /NOTION_DEFAULT_PARENT_PAGE_ID/i);
});

test("Fase 13 G: ENABLE_COMPOSIO_NOTION funciona como alias legacy para ENABLE_NOTION", async () => {
  setEnv({
    ENABLE_NOTION: undefined,
    ENABLE_COMPOSIO: "true",
    ENABLE_COMPOSIO_NOTION: "true",
    NOTION_PROVIDER: "composio",
    NOTION_FALLBACK_TO_MOCK: "true",
    COMPOSIO_READ_ONLY_MODE: "true",
    NOTION_TASKS_DATABASE_ID: "tasks-db-123",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Busca en Notion tareas pendientes" },
    {}
  );

  assert.equal(result.enabled, true);
});

test("Fase 13 H: read-only hereda de COMPOSIO_READ_ONLY_MODE cuando NOTION_READ_ONLY_MODE no está definido", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_DEFAULT_PARENT_PAGE_ID: "parent-page-123",
    NOTION_READ_ONLY_MODE: undefined,
    COMPOSIO_READ_ONLY_MODE: "true",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Crea una página en Notion con este resumen" },
    {}
  );

  assert.equal(result.blocked, true);
  assert.match(result.summary, /solo lectura/i);
});

test("Fase 13 I: create task reporta falta de NOTION_TASKS_DATABASE_ID cuando read-only está apagado", async () => {
  setEnv({
    ENABLE_NOTION: "true",
    ENABLE_COMPOSIO: "true",
    NOTION_PROVIDER: "composio",
    NOTION_READ_ONLY_MODE: "false",
    COMPOSIO_READ_ONLY_MODE: "false",
    REQUIRE_APPROVAL: "false",
    NOTION_FALLBACK_TO_MOCK: "false",
  });

  const result = await notionWorkspaceSkill.execute(
    { message: "Agrega una tarea en Notion: llamar a Juan mañana" },
    {}
  );

  assert.equal(result.source, "none");
  assert.match(result.summary, /NOTION_TASKS_DATABASE_ID/i);
});
