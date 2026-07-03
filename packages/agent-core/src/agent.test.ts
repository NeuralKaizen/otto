import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialSessionContext, hasSocialFollowUpSignals } from "./agent.js";

test("buildSocialSessionContext extrae username y platform desde un resultado social", () => {
  const context = buildSocialSessionContext({
    request: {
      platform: "instagram",
      username: "lucianomusellaa",
    },
    summary: "Fuente: Zernio. Top contenido para @lucianomusellaa.",
    dataSource: "zernio",
    warnings: ["warning-1", "warning-2", "warning-3", "warning-4"],
    profiles: [
      {
        platform: "instagram",
        topPosts: [
          {
            id: "post-1",
            title: "Video 1",
            url: "https://instagram.com/p/post-1",
            views: 120000,
          },
        ],
        recentContent: [
          {
            id: "post-2",
            title: "Reel 2",
            impressions: 90000,
            engagement: 4200,
          },
        ],
      },
    ],
  });

  assert.ok(context);
  assert.equal(context?.platform, "instagram");
  assert.equal(context?.username, "lucianomusellaa");
  assert.equal(context?.dataSource, "zernio");
  assert.equal(context?.lastToolName, "social_metrics_lookup");
  assert.equal(context?.topPosts[0]?.title, "Video 1");
  assert.equal(context?.recentContent[0]?.platform, "instagram");
  assert.equal(context?.warnings.length, 3);
});

test("hasSocialFollowUpSignals detecta follow-ups de top content y referencias a esa cuenta", () => {
  assert.equal(hasSocialFollowUpSignals("Cuales son los videos mas vistos de esa cuenta"), true);
  assert.equal(hasSocialFollowUpSignals("que contenido funciono mejor"), true);
  assert.equal(hasSocialFollowUpSignals("mejores posts de esta cuenta"), true);
  assert.equal(hasSocialFollowUpSignals("hola jarvis"), false);
});
