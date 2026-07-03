import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { notionRoutes } from "./notion.routes.js";

const ENV_KEYS = [
  "ENABLE_NOTION",
  "ENABLE_COMPOSIO",
  "ENABLE_COMPOSIO_NOTION",
  "NOTION_PROVIDER",
  "COMPOSIO_API_KEY",
  "COMPOSIO_USER_ID",
  "NOTION_DEFAULT_PARENT_PAGE_ID",
  "NOTION_TASKS_DATABASE_ID",
  "NOTION_READ_ONLY_MODE",
  "REQUIRE_APPROVAL",
] as const;

const savedEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  savedEnv.set(key, process.env[key]);
}

afterEach(() => {
  for (const [key, value] of savedEnv.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("GET /notion/status expone health seguro sin filtrar secrets", async () => {
  process.env.ENABLE_NOTION = "true";
  process.env.ENABLE_COMPOSIO = "true";
  process.env.ENABLE_COMPOSIO_NOTION = "true";
  process.env.NOTION_PROVIDER = "composio";
  process.env.COMPOSIO_API_KEY = "super-secret-key";
  process.env.COMPOSIO_USER_ID = "user-123";
  process.env.NOTION_DEFAULT_PARENT_PAGE_ID = "page-123";
  process.env.NOTION_TASKS_DATABASE_ID = "db-123";
  process.env.NOTION_READ_ONLY_MODE = "true";
  process.env.REQUIRE_APPROVAL = "true";

  const app = Fastify();
  notionRoutes(app, {
    discover: async () => ({
      notionConnected: true,
      actionValidation: {
        search: true,
        retrievePage: true,
        queryDatabase: true,
        createPage: true,
        createDatabaseItem: true,
        updatePage: true,
      },
      foundSlugs: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_CREATE_NOTION_PAGE"],
      missingSlugs: [],
      warnings: [],
    }),
  });
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/notion/status" });
  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.enabled, true);
  assert.equal(body.data.provider, "composio");
  assert.equal(body.data.composioConfigured, true);
  assert.equal(body.data.userIdPresent, true);
  assert.equal(body.data.canSearch, true);
  assert.equal(body.data.canCreatePage, false);
  assert.equal(JSON.stringify(body).includes("super-secret-key"), false);
  assert.ok(Array.isArray(body.data.validatedSlugs));

  await app.close();
});

test("GET /notion/query devuelve envelope de approval cuando la skill lo requiere", async () => {
  const app = Fastify();
  notionRoutes(app, {
    execute: async () => ({
      provider: "composio",
      action: "notion_create_page",
      risk: "write",
      summary: "Necesito tu aprobación antes de ejecutar esta acción en Notion.",
      items: [],
      insights: [],
      limitations: [],
      warnings: [],
      enabled: true,
      blocked: false,
      requiresApproval: true,
      source: "none",
      mode: "unavailable",
    }),
    discover: async () => ({
      notionConnected: true,
      actionValidation: {
        search: true,
        retrievePage: true,
        queryDatabase: true,
        createPage: true,
        createDatabaseItem: true,
        updatePage: true,
      },
      foundSlugs: [],
      missingSlugs: [],
      warnings: [],
    }),
  });
  await app.ready();

  const response = await app.inject({
    method: "GET",
    url: "/notion/query?q=Crea%20una%20p%C3%A1gina%20en%20Notion",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.requiresApproval, true);
  assert.equal(body.data.action, "notion_create_page");

  await app.close();
});
