import type { SkillDefinition, SkillContext } from "../types.js";

interface SystemStatusOutput {
  api: { status: "ok" | "error"; message: string };
  database: { status: "ok" | "error"; message: string };
  llmProvider: string;
  voiceProvider: string;
  features: Record<string, boolean>;
  timestamp: string;
}

export const getSystemStatus: SkillDefinition<{ message: string }, SystemStatusOutput> = {
  name: "getSystemStatus",
  description: "Devuelve el estado actual del sistema Wattson: API, base de datos, proveedores y feature flags",
  inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  requiresApproval: false,
  riskLevel: "low",
  permissions: [],

  async execute(_args, _ctx: SkillContext): Promise<SystemStatusOutput> {
    let dbStatus: { status: "ok" | "error"; message: string } = { status: "ok", message: "SQLite connected" };

    try {
      const { getDb } = await import("@wattson/memory");
      await getDb().$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = { status: "error", message: String(e) };
    }

    return {
      api: { status: "ok", message: "Fastify running" },
      database: dbStatus,
      llmProvider: process.env.LLM_PROVIDER ?? "mock",
      voiceProvider: process.env.VOICE_PROVIDER ?? "mock",
      features: {
        voice: process.env.ENABLE_VOICE === "true",
        approvals: process.env.ENABLE_APPROVALS !== "false",
        mockCalendar: process.env.ENABLE_MOCK_CALENDAR !== "false",
        localCommands: process.env.ENABLE_LOCAL_COMMANDS === "true",
      },
      timestamp: new Date().toISOString(),
    };
  },
};
