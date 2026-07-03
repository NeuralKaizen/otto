import type { SkillDefinition, SkillContext } from "../types.js";

interface GetUpcomingEventsInput {
  message: string;
  range?: "today" | "tomorrow" | "week";
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

interface GetUpcomingEventsOutput {
  events: CalendarEvent[];
  range: string;
  source: "mock";
}

const MOCK_EVENTS: Record<string, CalendarEvent[]> = {
  today: [
    {
      title: "Standup de equipo",
      start: "2026-06-04T09:00:00-05:00",
      end: "2026-06-04T09:30:00-05:00",
      location: "Google Meet",
      description: "Revisión diaria de avances",
    },
    {
      title: "Demo de Wattson OS",
      start: "2026-06-04T15:00:00-05:00",
      end: "2026-06-04T15:30:00-05:00",
      location: "Zoom",
      description: "Presentación del MVP al equipo",
    },
  ],
  tomorrow: [
    {
      title: "Revisión de estrategia",
      start: "2026-06-05T10:00:00-05:00",
      end: "2026-06-05T11:00:00-05:00",
      location: "Oficina",
    },
  ],
  week: [
    {
      title: "Standup de equipo",
      start: "2026-06-04T09:00:00-05:00",
      end: "2026-06-04T09:30:00-05:00",
      location: "Google Meet",
    },
    {
      title: "Demo de Wattson OS",
      start: "2026-06-04T15:00:00-05:00",
      end: "2026-06-04T15:30:00-05:00",
      location: "Zoom",
    },
    {
      title: "Revisión de estrategia",
      start: "2026-06-05T10:00:00-05:00",
      end: "2026-06-05T11:00:00-05:00",
      location: "Oficina",
    },
    {
      title: "1:1 con cliente",
      start: "2026-06-06T14:00:00-05:00",
      end: "2026-06-06T15:00:00-05:00",
      location: "Google Meet",
    },
  ],
};

function detectRange(message: string): "today" | "tomorrow" | "week" {
  const m = message.toLowerCase();
  if (m.includes("mañana") || m.includes("tomorrow")) return "tomorrow";
  if (m.includes("semana") || m.includes("week")) return "week";
  return "today";
}

export const getUpcomingEvents: SkillDefinition<GetUpcomingEventsInput, GetUpcomingEventsOutput> = {
  name: "getUpcomingEvents",
  description: "Obtiene los próximos eventos del calendario (modo mock — integración real con Google Calendar pendiente)",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      range: { type: "string", enum: ["today", "tomorrow", "week"] },
    },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["calendar:read"],

  async execute(args: GetUpcomingEventsInput, _ctx: SkillContext): Promise<GetUpcomingEventsOutput> {
    const range = args.range ?? detectRange(args.message);
    const events = MOCK_EVENTS[range] ?? [];
    return { events, range, source: "mock" };
  },
};
