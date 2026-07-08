import type { Intent, AgentPlan } from "@wattson/shared";

// calendar_lookup y gmail_draft ya no se planifican: el router redirige esas
// lecturas/escrituras a external_tool_query (Composio real). Los miembros
// siguen en el tipo Intent compartido (@wattson/shared) para no romper
// mockProvider.ts ni otros consumidores; si createPlan() los recibe de todos
// modos, cae al plan de "unknown" en vez de invocar un skill mock retirado.
const UNKNOWN_PLAN: Omit<AgentPlan, "intent"> = {
  skillName: null,
  requiresApproval: false,
  description: "Intención no reconocida — respuesta genérica",
};

const PLAN_BY_INTENT: Partial<Record<Intent, Omit<AgentPlan, "intent">>> = {
  meeting_to_linkedin_post: {
    skillName: "generatePostIdeas",
    requiresApproval: false,
    description: "Generar ideas de posts de LinkedIn desde notas de reunión",
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
  return { intent, ...(PLAN_BY_INTENT[intent] ?? UNKNOWN_PLAN) };
}
