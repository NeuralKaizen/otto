/**
 * Task 5 — notion_project_intelligence vía Composio.
 *
 * Uses Node's built-in test runner (same pattern as the rest of this package —
 * there is no vitest dependency here). Module mocking uses `node:test`'s
 * `mock.module`, which requires the `--experimental-test-module-mocks` flag
 * (added to this package's `test` script in package.json).
 *
 * `executeNotionComposioAction` is mocked to mirror the exact shape
 * `client.tools.execute()` returns in notionComposioClient.ts —
 * `{ successful, data, error }` (see notionComposioClient.ts ~line 359-367,
 * where `response.successful` / `response.data` / `response.error` are read).
 * `data` carries the raw Composio NOTION_QUERY_DATABASE payload, which
 * composio/normalizers/notionNormalizer.ts already assumes is a pass-through
 * of Notion's `databases.query` response shape: `{ results: [ { id, properties, url }, ... ] }`,
 * each `properties` entry using Notion's native type-tagged property objects
 * (`{ type: "title", title: [...] }`, etc.) — the same shape notionRealAdapter.ts
 * reads via notionClient.ts's `queryDatabasePages`. This lets the Composio
 * adapter reuse notionNormalizer.ts's property getters unchanged.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const mockExecute = mock.fn(async (_actionSlug: string, _args: Record<string, unknown>) => ({
  successful: true,
  data: {
    results: [
      {
        id: "task-1",
        url: "https://notion.so/task-1",
        last_edited_time: "2026-01-01T00:00:00.000Z",
        properties: {
          Name: { type: "title", title: [{ plain_text: "Escribir spec" }] },
          Status: { type: "status", status: { name: "En progreso" } },
          Due: { type: "date", date: { start: "2020-01-01" } },
          Assignee: { type: "people", people: [{ name: "Luciano" }] },
        },
      },
    ],
  },
}));

mock.module("../notionComposioClient.js", {
  namedExports: {
    executeNotionComposioAction: mockExecute,
  },
});

mock.module("../notionConfig.js", {
  cache: false,
  namedExports: {
    getNotionConfig: () => ({
      enabled: true,
      apiKey: undefined,
      tasksDatabaseId: "tasks-db-id",
      projectsDatabaseId: "projects-db-id",
      taskProperties: {
        title: "Name",
        status: "Status",
        assignee: "Assignee",
        dueDate: "Due",
        project: "Project",
        priority: "Priority",
      },
      projectProperties: {
        title: "Name",
        status: "Status",
        owner: "Owner",
        progress: "Progress",
        dueDate: "Due",
      },
    }),
    getNotionWorkspaceConfig: () => ({
      enabled: true,
      provider: "composio",
      composioEnabled: true,
      legacyComposioNotionEnabled: false,
      composioConfigured: true,
      composioUserId: "user-1",
      userIdPresent: true,
      readOnlyMode: true,
      fallbackToMock: false,
      requireApproval: true,
    }),
    isNotionComposioQueryAvailable: () => true,
  },
});

const { notionComposioQueryAdapter } = await import("./notionComposioQueryAdapter.js");

test("notionComposioQueryAdapter.queryTasks normaliza una fila de Notion a NormalizedNotionTask", async () => {
  mockExecute.mock.resetCalls();
  const tasks = await notionComposioQueryAdapter.queryTasks({ intent: "workspace_overview" } as any);

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Escribir spec");
  assert.ok(tasks[0].assignees.includes("Luciano"));
  assert.equal(tasks[0].isOverdue, true); // Due 2020 < hoy
  assert.equal(tasks[0].dataSource, "notion_api"); // nunca etiqueta mock como real
});

test("notionComposioQueryAdapter.queryTasks consulta NOTION_QUERY_DATABASE con el database_id de tareas", async () => {
  mockExecute.mock.resetCalls();
  await notionComposioQueryAdapter.queryTasks({ intent: "workspace_overview" } as any);

  assert.equal(mockExecute.mock.calls.length, 1);
  const [actionSlug, args] = mockExecute.mock.calls[0].arguments;
  assert.equal(actionSlug, "NOTION_QUERY_DATABASE");
  assert.equal((args as { database_id?: string }).database_id, "tasks-db-id");
});

test("notionComposioQueryAdapter.queryProjects consulta NOTION_QUERY_DATABASE con el database_id de proyectos", async () => {
  mockExecute.mock.resetCalls();
  await notionComposioQueryAdapter.queryProjects({ intent: "workspace_overview" } as any);

  assert.equal(mockExecute.mock.calls.length, 1);
  const [actionSlug, args] = mockExecute.mock.calls[0].arguments;
  assert.equal(actionSlug, "NOTION_QUERY_DATABASE");
  assert.equal((args as { database_id?: string }).database_id, "projects-db-id");
});
