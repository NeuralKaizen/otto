import test from "node:test";
import assert from "node:assert/strict";
import { routeIntent } from "./router.js";

test("Caso E: detecta prompts sociales sin romper otras intenciones", () => {
  assert.equal(routeIntent("muéstrame métricas de instagram"), "social_metrics");
  assert.equal(routeIntent("cómo van mis redes sociales"), "social_metrics");
  assert.equal(routeIntent("dame el engagement de tiktok"), "social_metrics");
  assert.equal(routeIntent("revisa analytics de redes"), "social_metrics");

  assert.equal(routeIntent("crea un correo para Daniel"), "external_tool_query");
  assert.equal(routeIntent("crea una tarea en notion para mañana"), "notion_workspace");
});

// Phase 11 — Composio from chat routing
test("Fase 11 A: Gmail read prompts van a external_tool_query (Composio)", () => {
  assert.equal(routeIntent("Busca mis últimos correos de Gmail sobre facturas"), "external_tool_query");
  assert.equal(routeIntent("busca mis correos recientes"), "external_tool_query");
  assert.equal(routeIntent("revisa Gmail"), "external_tool_query");
  assert.equal(routeIntent("muéstrame mi inbox de Gmail"), "external_tool_query");
  assert.equal(routeIntent("últimos correos de Juan"), "external_tool_query");
  assert.equal(routeIntent("correos sobre el proyecto Acelera"), "external_tool_query");
});

test("Fase 11 B: Gmail draft con keyword 'gmail' va a external_tool_query", () => {
  assert.equal(routeIntent("Crea un draft en Gmail para Juan diciendo que mañana le confirmo"), "external_tool_query");
  assert.equal(routeIntent("redacta un borrador de gmail para el equipo sobre el sprint"), "external_tool_query");
  assert.equal(routeIntent("envía un correo en Gmail a María"), "external_tool_query");
});

test("Fase 11 C: Gmail genérico sin keyword 'gmail' también va a external_tool_query (Composio real)", () => {
  assert.equal(routeIntent("crea un correo para Daniel"), "external_tool_query");
  assert.equal(routeIntent("redacta un borrador para el cliente"), "external_tool_query");
  assert.equal(routeIntent("escribe un email de agradecimiento"), "external_tool_query");
});

test("Fase 14 A: Calendar read va a external_tool_query (Composio real, retira calendar_lookup mock)", () => {
  assert.equal(routeIntent("qué tengo mañana en mi calendario"), "external_tool_query");
  assert.equal(routeIntent("revisa mi agenda de esta semana"), "external_tool_query");
  assert.equal(routeIntent("eventos de hoy"), "external_tool_query");
});

test("Fase 11 D2: Calendar write va a external_tool_query (Composio)", () => {
  assert.equal(routeIntent("crea un evento mañana a las 3pm con Pedro"), "external_tool_query");
  assert.equal(routeIntent("agenda una reunión con el equipo"), "external_tool_query");
  assert.equal(routeIntent("bloquea tiempo para el sprint"), "external_tool_query");
});

test("Fase 13 A: Notion explícito va a la skill dedicada", () => {
  assert.equal(routeIntent("crea una página en Notion con el resumen de esta conversación"), "notion_workspace");
  assert.equal(routeIntent("agrega una tarea en notion"), "notion_workspace");
  assert.equal(routeIntent("Busca en Notion tareas pendientes"), "notion_workspace");
  assert.equal(routeIntent("Muéstrame mis páginas recientes de Notion"), "notion_workspace");
});

test("Fase 11 G: GitHub write va a external_tool_query", () => {
  assert.equal(routeIntent("crea un issue en GitHub para arreglar el bug del login"), "external_tool_query");
  assert.equal(routeIntent("lista los issues abiertos del repo"), "external_tool_query");
  assert.equal(routeIntent("busca mis issues abiertos en GitHub"), "external_tool_query");
  assert.equal(routeIntent("revisa pull requests en github"), "external_tool_query");
});

// Fase 12 — social follow-up routing
test("Fase 12 A: cross-platform comparison prompts ruteados a social_metrics via plataforma mencionada", () => {
  // "y en tiktok" menciona "tiktok" → social_metrics directamente en el router
  assert.equal(routeIntent("y en tiktok cómo va?"), "social_metrics");
  assert.equal(routeIntent("muéstrame lo mismo en instagram"), "social_metrics");
  assert.equal(routeIntent("y en youtube tiene más seguidores?"), "social_metrics");
});

test("Fase 12 B: follow-ups vagos sin username van a unknown (el agent.ts los sobreescribe con contexto)", () => {
  // El router no tiene contexto de sesión, por eso "mejorar" solo llega a unknown.
  // agent.ts lo convierte a social_metrics cuando hay session context.
  assert.equal(routeIntent("qué debería mejorar?"), "unknown");
  assert.equal(routeIntent("está bien ese engagement?"), "unknown");
  assert.equal(routeIntent("cuánto sería un buen crecimiento?"), "unknown");
});

test("Fase 12 B2: follow-ups de top content van a social_metrics aunque no tengan username", () => {
  assert.equal(routeIntent("Cuales son los videos mas vistos de esa cuenta"), "social_metrics");
  assert.equal(routeIntent("reels con más vistas"), "social_metrics");
  assert.equal(routeIntent("mejores posts"), "social_metrics");
  assert.equal(routeIntent("qué contenido funcionó mejor"), "social_metrics");
});

test("Fase 12 C: social_metrics se mantiene para keywords de engagement/redes en frases claras", () => {
  assert.equal(routeIntent("dame las métricas de engagement de @user"), "social_metrics");
  assert.equal(routeIntent("analiza las redes sociales de la cuenta"), "social_metrics");
  assert.equal(routeIntent("muéstrame el crecimiento de su cuenta"), "social_metrics");
});
