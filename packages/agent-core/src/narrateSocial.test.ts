import { test } from "node:test";
import assert from "node:assert/strict";
import { narrateSocialMetrics, numToWords } from "./narrateSocial.js";

test("numToWords redondea a lenguaje natural", () => {
  assert.equal(numToWords(34435), "34 mil");
  assert.equal(numToWords(128000), "128 mil");
  assert.equal(numToWords(1_200_000), "1,2 millones");
  assert.equal(numToWords(950), "950");
});

test("narra cálido con seguidores, engagement y top", () => {
  const n = narrateSocialMetrics({
    profiles: [
      {
        platform: "instagram",
        username: "lucianomusellaa",
        followers: 34435,
        engagementRate: 4.2,
        topPosts: [{ title: "reel de gimnasio", likes: 12800 }],
      },
    ],
  });
  assert.ok(n);
  assert.match(n!, /Con gusto, Luciano\./);
  assert.match(n!, /Instagram reúne 34 mil seguidores/);
  assert.match(n!, /engagement del 4,2 por ciento/);
  assert.match(n!, /reel de gimnasio.*13 mil interacciones/);
  assert.match(n!, /Vas muy bien\./);
});

test("sin perfiles → null (el agente sigue su flujo normal)", () => {
  assert.equal(narrateSocialMetrics({ profiles: [] }), null);
  assert.equal(narrateSocialMetrics({}), null);
  assert.equal(narrateSocialMetrics("nope"), null);
});

test("multiplataforma lo menciona", () => {
  const n = narrateSocialMetrics({
    profiles: [
      { platform: "instagram", followers: 34000, engagementRate: 4.2 },
      { platform: "tiktok", followers: 18000, engagementRate: 6.1 },
    ],
  });
  assert.match(n!, /2 plataformas en seguimiento/);
});
