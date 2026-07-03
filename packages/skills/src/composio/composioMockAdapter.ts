import type { ComposioAdapter, ComposioToolRequest, ComposioToolResult } from "./types.js";
import { classifyActionRisk } from "./composioPolicy.js";

function queryFromParams(params: Record<string, unknown>): string {
  const value = params.query ?? params.q ?? params.text;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "tareas pendientes";
}

function mockNotionData(query: string): unknown {
  return {
    results: [
      {
        id: "mock-notion-page-1",
        object: "page",
        url: "https://notion.so/mock-notion-page-1",
        properties: {
          Name: { type: "title", title: [{ plain_text: `Revisar ${query}` }] },
          Status: { type: "status", status: { name: "Pendiente" } },
          Proyectos: { type: "rollup", rollup: { array: [{ type: "title", title: [{ plain_text: "Acelera" }] }] } },
        },
      },
      {
        id: "mock-notion-page-2",
        object: "page",
        url: "https://notion.so/mock-notion-page-2",
        properties: {
          Name: { type: "title", title: [{ plain_text: `Seguimiento de ${query}` }] },
          Status: { type: "status", status: { name: "En progreso" } },
          Proyectos: { type: "rollup", rollup: { array: [{ type: "title", title: [{ plain_text: "Jarvis" }] }] } },
        },
      },
    ],
  };
}

function mockGmailDrafts(): unknown {
  return {
    drafts: [
      {
        id: "mock-draft-1",
        message: {
          id: "mock-msg-draft-1",
          snippet: "Borrador guardado — pendiente de revisión.",
          payload: {
            headers: [
              { name: "Subject", value: "Borrador: seguimiento" },
              { name: "From", value: "jose@acelera.com" },
            ],
          },
        },
      },
    ],
  };
}

function mockGmailMessages(query: string): unknown {
  return {
    messages: [
      {
        id: "mock-email-1",
        snippet: `Mensaje relacionado con ${query}.`,
        payload: {
          headers: [
            { name: "From", value: "juan@example.com" },
            { name: "Subject", value: `Re: ${query}` },
          ],
        },
      },
      {
        id: "mock-email-2",
        snippet: `Seguimiento sobre ${query}.`,
        payload: {
          headers: [
            { name: "From", value: "maria@example.com" },
            { name: "Subject", value: `${query} — actualización` },
          ],
        },
      },
    ],
  };
}

function isoAt(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function mockCalendarData(): unknown {
  return {
    items: [
      {
        id: "mock-event-1",
        summary: "Reunión de equipo",
        start: { dateTime: isoAt(1, 10) },
        end: { dateTime: isoAt(1, 11) },
        htmlLink: "https://calendar.google.com/mock-event-1",
      },
      {
        id: "mock-event-2",
        summary: "Llamada con cliente",
        start: { dateTime: isoAt(1, 15) },
        end: { dateTime: isoAt(1, 15.5) },
        htmlLink: "https://calendar.google.com/mock-event-2",
      },
    ],
  };
}

function mockSlackData(query: string): unknown {
  const matches = [
    { text: `Mensaje sobre ${query} en #general`, user: "U_JOSE", permalink: "https://slack.com/mock-1" },
    { text: `Hilo relacionado con ${query}`, user: "U_PABLO", permalink: "https://slack.com/mock-2" },
  ];
  return { messages: { matches } };
}

function mockGithubData(): unknown {
  const issues = [
    { number: 101, title: "Revisar configuración de CI", state: "open", html_url: "https://github.com/mock/repo/issues/101", user: { login: "jose" } },
    { number: 98, title: "Actualizar documentación de Composio", state: "open", html_url: "https://github.com/mock/repo/issues/98", user: { login: "pablo" } },
  ];
  return { items: issues };
}

/**
 * Deterministic mock results for the Composio Tool Gateway, used whenever
 * Composio is disabled, unconfigured, or the real adapter fails. Covers the
 * read actions registered in `composioToolRegistry.ts` for each toolkit.
 * Returns raw (unnormalized) data — `composioSkill.ts` applies the same
 * normalizers to mock and real results alike.
 */
class ComposioMockAdapter implements ComposioAdapter {
  isAvailable(): boolean {
    return true;
  }

  async execute(request: ComposioToolRequest): Promise<ComposioToolResult> {
    const query = queryFromParams(request.params);
    const risk = classifyActionRisk(request.action);
    let data: unknown;

    switch (request.toolkit) {
      case "notion":
        data = mockNotionData(query);
        break;
      case "gmail":
        data = request.action.toLowerCase().includes("draft") ? mockGmailDrafts() : mockGmailMessages(query);
        break;
      case "googlecalendar":
        data = mockCalendarData();
        break;
      case "slack":
        data = mockSlackData(query);
        break;
      case "github":
        data = mockGithubData();
        break;
    }

    return {
      toolkit: request.toolkit,
      action: request.action,
      success: true,
      data,
      source: "mock",
      risk,
    };
  }
}

export const composioMockAdapter = new ComposioMockAdapter();
