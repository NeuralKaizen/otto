import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { socialMetricsSkill } from "./socialMetricsSkill.js";

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
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  restoreEnv();
});

test("reutiliza el contexto social para follow-up de videos más vistos de esa cuenta", async () => {
  process.env.ENABLE_SOCIAL_METRICS = "true";
  process.env.ENABLE_ZERNIO = "true";
  process.env.ZERNIO_API_KEY = "configured";

  const responses = [
    jsonResponse({
      accounts: [
        {
          _id: "acct_123",
          platform: "instagram",
          username: "@lucianomusellaa",
          displayName: "Luciano Musella",
          currentFollowers: 1200,
        },
      ],
    }),
    jsonResponse({
      accounts: [{ _id: "acct_123", currentFollowers: 1200 }],
      stats: { acct_123: [{ date: "2026-06-01", followers: 1200 }] },
    }),
    jsonResponse({
      posts: [
        {
          postId: "post_1",
          content: "Post con más vistas",
          publishedAt: "2026-06-01T10:00:00.000Z",
          analytics: {
            views: 9000,
            impressions: 12000,
            likes: 100,
            comments: 10,
            shares: 5,
            saves: 3,
            clicks: 1,
            lastUpdated: "2026-06-02T00:00:00.000Z",
          },
        },
        {
          postId: "post_2",
          content: "Post mediano",
          publishedAt: "2026-06-02T10:00:00.000Z",
          analytics: {
            views: 3000,
            impressions: 8000,
            likes: 80,
            comments: 8,
            shares: 3,
            saves: 2,
            clicks: 1,
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

  const result = await socialMetricsSkill.execute(
    { message: "Cuales son los videos mas vistos de esa cuenta" },
    {
      socialContext: {
        platform: "instagram",
        username: "lucianomusellaa",
        dataSource: "zernio",
      },
    }
  );

  assert.equal(result.request.username, "lucianomusellaa");
  assert.equal(result.request.platform, "instagram");
  assert.equal(result.contentFocus, "top_content");
  assert.equal(result.rankingMetric, "views");
  assert.match(result.summary, /Fuente: Zernio/);
  assert.equal(result.profiles[0]?.topPosts?.[0]?.title, "Post con más vistas");
  assert.equal((result.profiles[0]?.topPosts?.[0]?.views ?? 0) >= (result.profiles[0]?.topPosts?.[1]?.views ?? 0), true);
});

test("sin contexto suficiente pide la cuenta mínima para follow-up de top content", async () => {
  const result = await socialMetricsSkill.execute(
    { message: "reels con más vistas" },
    {}
  );

  assert.equal(result.dataSource, "unavailable");
  assert.equal(result.contentFocus, "top_content");
  assert.match(result.summary, /¿De qué cuenta quieres que revise el contenido más visto\?/);
  assert.match(result.warnings.join(" "), /no tengo una cuenta previa/i);
});
