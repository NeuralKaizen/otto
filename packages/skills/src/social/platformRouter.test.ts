import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { routePlatformRequest } from "./platformRouter.js";
import { getSocialRuntimeState, resetSocialRuntimeState, parseEnvBoolean, getSocialConfig, validateSocialConfig } from "./socialConfig.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  restoreEnv();
  resetSocialRuntimeState();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  restoreEnv();
  resetSocialRuntimeState();
});

test("Caso A: usa mock sin intentar Zernio cuando ENABLE_ZERNIO=false", async () => {
  process.env.ENABLE_SOCIAL_METRICS = "true";
  process.env.ENABLE_ZERNIO = "false";
  process.env.ZERNIO_FALLBACK_TO_MOCK = "true";

  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  const result = await routePlatformRequest({
    platform: "instagram",
    username: "nike",
    includeAnalysis: true,
    includeRecentContent: true,
  });

  assert.equal(called, false);
  assert.equal(result.dataSource, "mock");
  assert.equal(result.isMock, true);
  assert.equal(result.profiles[0]?.dataSource, "mock");
  assert.equal(result.profiles[0]?.isMock, true);
  // Warning explains how to activate (not just "disabled")
  assert.match(result.warnings.join(" "), /ENABLE_ZERNIO/);
});

test("Caso B: usa mock sin crashear cuando falta ZERNIO_API_KEY", async () => {
  process.env.ENABLE_SOCIAL_METRICS = "true";
  process.env.ENABLE_ZERNIO = "true";
  delete process.env.ZERNIO_API_KEY;
  process.env.ZERNIO_FALLBACK_TO_MOCK = "true";

  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  const result = await routePlatformRequest({
    platform: "youtube",
    username: "mkbhd",
    includeAnalysis: true,
    includeRecentContent: true,
  });

  assert.equal(called, false);
  assert.equal(result.dataSource, "mock");
  assert.equal(result.isMock, true);
  assert.equal(result.profiles[0]?.dataSource, "mock");
  assert.equal(result.profiles[0]?.isMock, true);
  assert.match(result.warnings.join(" "), /ZERNIO_API_KEY/);
});

test("Caso C: hace fallback seguro ante 401/403 sin exponer secretos", async () => {
  process.env.ENABLE_SOCIAL_METRICS = "true";
  process.env.ENABLE_ZERNIO = "true";
  process.env.ZERNIO_API_KEY = "super-secret-key";
  process.env.ZERNIO_FALLBACK_TO_MOCK = "true";

  let callCount = 0;
  global.fetch = (async () => {
    callCount += 1;
    return jsonResponse({ error: "Unauthorized" }, 401);
  }) as typeof fetch;

  const result = await routePlatformRequest({
    platform: "instagram",
    username: "brand",
    includeAnalysis: true,
    includeRecentContent: true,
  });

  assert.equal(callCount > 0, true);
  assert.equal(result.dataSource, "mock");
  assert.equal(result.isMock, true);
  assert.match(result.warnings.join(" "), /autenticación|permisos/i);
  assert.doesNotMatch(result.summary, /super-secret-key/);
  assert.doesNotMatch(result.warnings.join(" "), /super-secret-key/);
});

test("Caso D: mapea respuesta válida de Zernio al contrato interno", async () => {
  process.env.ENABLE_SOCIAL_METRICS = "true";
  process.env.ENABLE_ZERNIO = "true";
  process.env.ZERNIO_API_KEY = "configured";
  process.env.ZERNIO_FALLBACK_TO_MOCK = "true";
  process.env.ZERNIO_DEFAULT_LIMIT = "5";

  const responses = [
    jsonResponse({
      accounts: [
        {
          _id: "acct_123",
          platform: "instagram",
          username: "@brand",
          displayName: "Brand Account",
          profileUrl: "https://www.instagram.com/brand/",
          currentFollowers: 1200,
        },
      ],
    }),
    jsonResponse({
      accounts: [
        {
          _id: "acct_123",
          platform: "instagram",
          username: "@brand",
          currentFollowers: 1200,
        },
      ],
      stats: {
        acct_123: [
          { date: "2026-06-01", followers: 1100 },
          { date: "2026-06-02", followers: 1200 },
        ],
      },
    }),
    jsonResponse({
      posts: [
        {
          postId: "post_1",
          content: "First post",
          publishedAt: "2026-06-01T10:00:00.000Z",
          platformPostUrl: "https://instagram.com/p/1",
          analytics: {
            impressions: 1000,
            reach: 850,
            likes: 100,
            comments: 20,
            shares: 10,
            saves: 5,
            clicks: 2,
            views: 0,
            engagementRate: 11.8,
            lastUpdated: "2026-06-02T00:00:00.000Z",
          },
        },
        {
          postId: "post_2",
          content: "Second post",
          publishedAt: "2026-06-02T10:00:00.000Z",
          platformPostUrl: "https://instagram.com/p/2",
          analytics: {
            impressions: 500,
            reach: 400,
            likes: 40,
            comments: 5,
            shares: 4,
            saves: 2,
            clicks: 1,
            views: 0,
            engagementRate: 11.25,
            lastUpdated: "2026-06-03T00:00:00.000Z",
          },
        },
      ],
    }),
  ];

  global.fetch = (async () => {
    const next = responses.shift();
    assert.ok(next, "unexpected extra fetch call");
    return next;
  }) as typeof fetch;

  const result = await routePlatformRequest({
    platform: "instagram",
    username: "brand",
    includeAnalysis: true,
    includeRecentContent: true,
  });

  const profile = result.profiles[0];
  assert.equal(result.dataSource, "zernio");
  assert.equal(result.isMock, false);
  assert.equal(profile?.dataSource, "zernio");
  assert.equal(profile?.isMock, false);
  assert.equal(profile?.accountId, "acct_123");
  assert.equal(profile?.accountName, "Brand Account");
  assert.equal(profile?.impressions, 1500);
  assert.equal(profile?.reach, 1250);
  assert.equal(profile?.likes, 140);
  assert.equal(profile?.comments, 25);
  assert.equal(profile?.shares, 14);
  assert.equal(profile?.saves, 7);
  assert.equal(profile?.clicks, 3);
  assert.equal(profile?.engagement, 189);
  assert.equal(profile?.topPosts?.length, 2);
  assert.equal(profile?.warnings[0], "Datos reales obtenidos desde una cuenta conectada en Zernio.");
  assert.equal(getSocialRuntimeState().lastKnownMode, "zernio");
});

// Fase 12 — parseEnvBoolean + Zernio env debug

test("Caso E: parseEnvBoolean normaliza espacios y capitalización", () => {
  const orig = { ...process.env };

  process.env.TEST_BOOL_UPPER = "True";
  assert.equal(parseEnvBoolean("TEST_BOOL_UPPER", false), true, "True (capitalized) debe ser true");

  process.env.TEST_BOOL_SPACES = "  true  ";
  assert.equal(parseEnvBoolean("TEST_BOOL_SPACES", false), true, "' true ' con espacios debe ser true");

  process.env.TEST_BOOL_ONE = "1";
  assert.equal(parseEnvBoolean("TEST_BOOL_ONE", false), true, "'1' debe ser true");

  process.env.TEST_BOOL_FALSE = "FALSE";
  assert.equal(parseEnvBoolean("TEST_BOOL_FALSE", true), false, "FALSE (uppercase) debe ser false");

  process.env.TEST_BOOL_ZERO = "0";
  assert.equal(parseEnvBoolean("TEST_BOOL_ZERO", true), false, "'0' debe ser false");

  process.env.TEST_BOOL_UNKNOWN = "maybe";
  assert.equal(parseEnvBoolean("TEST_BOOL_UNKNOWN", true), true, "valor desconocido usa el default (true)");
  assert.equal(parseEnvBoolean("TEST_BOOL_UNKNOWN", false), false, "valor desconocido usa el default (false)");

  delete process.env.TEST_BOOL_UPPER;
  delete process.env.TEST_BOOL_SPACES;
  delete process.env.TEST_BOOL_ONE;
  delete process.env.TEST_BOOL_FALSE;
  delete process.env.TEST_BOOL_ZERO;
  delete process.env.TEST_BOOL_UNKNOWN;
  Object.assign(process.env, orig);
});

test("Caso F: ENABLE_ZERNIO=True (capitalizado) activa Zernio en getSocialConfig", () => {
  const origZernio = process.env.ENABLE_ZERNIO;
  const origKey = process.env.ZERNIO_API_KEY;

  process.env.ENABLE_ZERNIO = "True";
  process.env.ZERNIO_API_KEY = "test-key-abc";

  const config = getSocialConfig();
  assert.equal(config.zernioEnabled, true, "ENABLE_ZERNIO=True debe activar Zernio");

  const status = validateSocialConfig(config);
  assert.equal(status.zernioEnabled, true);
  assert.equal(status.zernioConfigured, true);
  assert.equal(status.canUseZernio, true);
  assert.equal(status.mode, "zernio");
  // Should NOT have the "not recognized" warning since it parsed correctly
  assert.ok(!status.warnings.some((w) => w.includes("no es un valor booleano")), "no debería tener warning de valor no reconocido");

  process.env.ENABLE_ZERNIO = origZernio ?? "";
  if (origZernio === undefined) delete process.env.ENABLE_ZERNIO;
  process.env.ZERNIO_API_KEY = origKey ?? "";
  if (origKey === undefined) delete process.env.ZERNIO_API_KEY;
});

test("Caso G: ENABLE_ZERNIO no definido → warning claro que NO dice 'false'", () => {
  const orig = process.env.ENABLE_ZERNIO;
  delete process.env.ENABLE_ZERNIO;

  const config = getSocialConfig();
  assert.equal(config.zernioEnabled, false, "por defecto Zernio está desactivado");

  const status = validateSocialConfig(config);
  assert.ok(
    status.warnings.some((w) => w.includes("ENABLE_ZERNIO=true")),
    "el warning debe sugerir ENABLE_ZERNIO=true"
  );
  assert.ok(
    !status.warnings.some((w) => w.includes("no es un valor booleano")),
    "no debería indicar valor inválido cuando simplemente no está definido"
  );

  if (orig !== undefined) process.env.ENABLE_ZERNIO = orig;
});

test("Caso H: ENABLE_ZERNIO=TrUe (mixed case) activa Zernio y no genera warning de valor inválido", async () => {
  const orig = process.env.ENABLE_ZERNIO;
  const origKey = process.env.ZERNIO_API_KEY;

  process.env.ENABLE_ZERNIO = "TrUe";
  process.env.ZERNIO_API_KEY = "test-key";
  delete process.env.ZERNIO_FALLBACK_TO_MOCK;

  const config = getSocialConfig();
  assert.equal(config.zernioEnabled, true);

  // routePlatformRequest with Zernio enabled + key but no real network → falls back to mock on error
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const result = await routePlatformRequest({ platform: "instagram", username: "test", includeAnalysis: true, includeRecentContent: true });

  global.fetch = originalFetch;

  // fetch was called (Zernio adapter tried to connect) = Zernio IS active
  assert.equal(fetchCalled, true, "fetch debe haberse llamado porque Zernio está habilitado");
  // account not found → mock fallback
  assert.equal(result.dataSource, "mock");

  process.env.ENABLE_ZERNIO = orig ?? "";
  if (orig === undefined) delete process.env.ENABLE_ZERNIO;
  process.env.ZERNIO_API_KEY = origKey ?? "";
  if (origKey === undefined) delete process.env.ZERNIO_API_KEY;
  resetSocialRuntimeState();
});
