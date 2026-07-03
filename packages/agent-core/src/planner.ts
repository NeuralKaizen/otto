import type { Intent, AgentPlan } from "@wattson/shared";

const PLAN_BY_INTENT: Record<Intent, Omit<AgentPlan, "intent">> = {
  meeting_to_linkedin_post: {
    skillName: "generatePostIdeas",
    requiresApproval: false,
    description: "Generar ideas de posts de LinkedIn desde notas de reunión",
  },
  calendar_lookup: {
    skillName: "getUpcomingEvents",
    requiresApproval: false,
    description: "Consultar próximos eventos del calendario",
  },
  gmail_draft: {
    skillName: "gmailDraftMock",
    requiresApproval: true,
    description: "Crear borrador de correo en Gmail",
  },
  memory_search: {
    skillName: "searchMemory",
    requiresApproval: false,
    description: "Buscar información en la memoria de Wattson",
  },
  save_memory: {
    skillName: "saveMemory",
    requiresApproval: false,
    description: "Guardar información en la memoria de Wattson",
  },
  system_status: {
    skillName: "getSystemStatus",
    requiresApproval: false,
    description: "Consultar estado del sistema y servicios",
  },
  social_metrics: {
    skillName: "social_metrics_lookup",
    requiresApproval: false,
    description: "Obtener métricas de redes sociales por username",
  },
  notion_workspace: {
    skillName: "notion_workspace_assistant",
    requiresApproval: false,
    description: "Consultar y ejecutar acciones explícitas de Notion vía skill dedicada",
  },
  notion_project_intelligence: {
    skillName: "notion_project_intelligence",
    requiresApproval: false,
    description: "Consultar tareas y proyectos en Notion (solo lectura)",
  },
  external_tool_query: {
    skillName: "composio_tool_gateway",
    requiresApproval: false,
    description: "Consultar o ejecutar herramientas externas (Slack, GitHub, etc.) vía Composio",
  },
  general_chat: {
    skillName: null,
    requiresApproval: false,
    description: "Respuesta conversacional directa",
  },
  unknown: {
    skillName: null,
    requiresApproval: false,
    description: "Intención no reconocida — respuesta genérica",
  },
};

export function createPlan(intent: Intent): AgentPlan {
  return { intent, ...PLAN_BY_INTENT[intent] };
}
