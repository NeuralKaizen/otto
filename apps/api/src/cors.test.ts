import { test } from "node:test";
import assert from "node:assert/strict";
import { corsOrigins } from "./cors.js";

// @fastify/cors acepta strings y RegExp; matchear como lo haría el plugin.
function allows(origins: (string | RegExp)[], origin: string): boolean {
  return origins.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
}

test("en dev permite HUD (:5173) y web (:3000) a la vez", () => {
  const origins = corsOrigins({ webUrl: "http://localhost:5173", nodeEnv: "development" });
  assert.equal(allows(origins, "http://localhost:5173"), true);
  assert.equal(allows(origins, "http://localhost:3000"), true);
});

test("en dev NO permite orígenes remotos arbitrarios", () => {
  const origins = corsOrigins({ webUrl: "http://localhost:5173", nodeEnv: "development" });
  assert.equal(allows(origins, "https://evil.example.com"), false);
});

test("en producción permite WEB_URL, Tauri y los dominios de Vercel del proyecto", () => {
  const origins = corsOrigins({ webUrl: "https://hud.wattson.app", nodeEnv: "production" });
  assert.equal(allows(origins, "https://hud.wattson.app"), true);
  assert.equal(allows(origins, "tauri://localhost"), true);
  assert.equal(allows(origins, "https://tauri.localhost"), true);
  assert.equal(allows(origins, "https://otto-pearl.vercel.app"), true);
  assert.equal(allows(origins, "https://otto-3v968eh24-neuralkaizens-projects.vercel.app"), true);
  assert.equal(allows(origins, "http://localhost:3000"), false);
  assert.equal(allows(origins, "https://evil.vercel.app"), false);
});
