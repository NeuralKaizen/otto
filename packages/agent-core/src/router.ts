import type { Intent } from "@wattson/shared";

export type { Intent };

const TOP_CONTENT_PATTERNS = [
  "videos más vistos",
  "videos mas vistos",
  "reels más vistos",
  "reels mas vistos",
  "reels con más vistas",
  "reels con mas vistas",
  "publicaciones más vistas",
  "publicaciones mas vistas",
  "top posts",
  "mejores posts",
  "contenido con más vistas",
  "contenido con mas vistas",
  "qué contenido funcionó mejor",
  "que contenido funciono mejor",
];

export function routeIntent(message: string): Intent {
  const m = message.toLowerCase();

  if (
    m.includes("linkedin") ||
    m.includes("post de linkedin") ||
    m.includes("publicación") ||
    m.includes("ideas para post") ||
    m.includes("post sobre")
  ) {
    return "meeting_to_linkedin_post";
  }

  // Gmail via Composio gateway: any prompt mentioning "gmail" explicitly, plus
  // read-only Gmail phrases and generic email/draft phrasing — all Gmail
  // reads and drafts go through the real Composio gateway (no mock flow).
  if (
    m.includes("gmail") ||
    m.includes("busca mis correos") ||
    m.includes("busca correos") ||
    m.includes("últimos correos") ||
    m.includes("ultimos correos") ||
    m.includes("revisa mis correos") ||
    m.includes("revisa mi bandeja") ||
    m.includes("correos sobre") ||
    m.includes("emails sobre") ||
    m.includes("inbox de") ||
    m.includes("correo") ||
    m.includes("email") ||
    m.includes("borrador") ||
    m.includes("draft") ||
    m.includes("escribe un email") ||
    m.includes("crea un correo")
  ) {
    return "external_tool_query";
  }

  // Calendar actions (write and read) → Composio real. Reads (calendario,
  // agenda, eventos, reuniones, "qué tengo") share the same intent as writes.
  if (
    m.includes("crea un evento") ||
    m.includes("crea una reunión") ||
    m.includes("crea una reunion") ||
    m.includes("bloquea tiempo") ||
    m.includes("agenda una reunión") ||
    m.includes("agenda una reunion") ||
    m.includes("agrega un evento") ||
    /\b(crea|agrega)\s+(un|una)\s+(evento|cita|meeting)\b/.test(m) ||
    m.includes("calendario") ||
    m.includes("agenda") ||
    m.includes("eventos") ||
    m.includes("reuniones") ||
    m.includes("qué tengo") ||
    m.includes("que tengo")
  ) {
    return "external_tool_query";
  }

  if (
    m.includes("qué recuerdas") ||
    m.includes("que recuerdas") ||
    m.includes("busca en memoria") ||
    m.includes("tienes guardado") ||
    m.includes("qué sabes de") ||
    m.includes("que sabes de") ||
    m.includes("recuerdas sobre")
  ) {
    return "memory_search";
  }

  if (
    m.includes("recuerda que") ||
    m.includes("recuerda:") ||
    m.includes("guarda en memoria") ||
    m.includes("anota que") ||
    m.includes("guarda esto")
  ) {
    return "save_memory";
  }

  if (
    m.includes("estado del sistema") ||
    m.includes("estado de wattson") ||
    m.includes("system status") ||
    m.includes("estado de la api") ||
    m.includes("cómo estás") ||
    m.includes("como estas")
  ) {
    return "system_status";
  }

  if (
    m.includes("instagram") ||
    m.includes("tiktok") ||
    m.includes("youtube") ||
    m.includes("métricas de youtube") ||
    m.includes("metricas de youtube") ||
    m.includes("estadísticas de youtube") ||
    m.includes("estadisticas de youtube") ||
    m.includes("canal de youtube") ||
    m.includes("analytics de") ||
    m.includes("métricas de") ||
    m.includes("metricas de") ||
    m.includes("estadísticas de") ||
    m.includes("estadisticas de") ||
    m.includes("followers de") ||
    m.includes("engagement de") ||
    m.includes("crecimiento de") ||
    TOP_CONTENT_PATTERNS.some((pattern) => m.includes(pattern)) ||
    m.includes("redes sociales") ||
    (m.includes("redes") && (
      m.includes("analiza") ||
      m.includes("métricas") ||
      m.includes("metricas") ||
      m.includes("estadísticas") ||
      m.includes("estadisticas") ||
      m.includes("mejorar") ||
      m.includes("recomendaciones")
    ))
  ) {
    return "social_metrics";
  }

  // Explicit Notion prompts should go to the dedicated skill before the
  // generic Composio gateway, both for read and write actions.
  if (
    m.includes("notion") &&
    (
      /\b(busca|buscar|revisa|revisar|muestra|mostrar|p[aá]gina|p[aá]ginas|tarea|tareas|pendientes|recientes|estado del proyecto|lee|leer|abre|abrir)\b/.test(m) ||
      /\b(crea|crear|create|agrega|agregar|añade|añadir|guarda|guardar|actualiza|actualizar|cambia|cambiar|nueva tarea|nuevo proyecto|crear tarea|crear página|crear pagina)\b/.test(m)
    )
  ) {
    return "notion_workspace";
  }

  if (
    m.includes("notion") ||
    m.includes("tareas") ||
    m.includes("task") ||
    m.includes("pendientes") ||
    m.includes("pendiente") ||
    m.includes("proyecto") ||
    m.includes("avance") ||
    m.includes("estado del proyecto") ||
    m.includes("qué tiene") ||
    m.includes("que tiene") ||
    m.includes("quién tiene") ||
    m.includes("quien tiene") ||
    m.includes("asignado") ||
    m.includes("asignada") ||
    m.includes("responsable") ||
    m.includes("vencidas") ||
    m.includes("vencida") ||
    m.includes("atrasad") ||
    m.includes("bloqueadas") ||
    m.includes("bloqueado") ||
    m.includes("daily briefing") ||
    m.includes("briefing diario") ||
    m.includes("en qué va") ||
    m.includes("en que va") ||
    m.includes("qué falta") ||
    m.includes("que falta") ||
    m.includes("resumen general") ||
    m.includes("resumen del equipo") ||
    m.includes("panorama general") ||
    m.includes("cómo va el equipo") ||
    m.includes("como va el equipo") ||
    m.includes("a cargo")
  ) {
    return "notion_project_intelligence";
  }

  if (
    m.includes("slack") ||
    m.includes("github") ||
    m.includes("pull request") ||
    m.includes("repositorio") ||
    m.includes("issues de github") ||
    m.includes("issue de github") ||
    m.includes("crea un issue") ||
    m.includes("crea una issue") ||
    m.includes("abre un issue") ||
    m.includes("abre un pull request") ||
    m.includes("comenta en el pr") ||
    m.includes("comenta en el issue") ||
    m.includes("commits recientes") ||
    m.includes("issues abiertos")
  ) {
    return "external_tool_query";
  }

  if (
    m.includes("hola") ||
    m.includes("hi") ||
    m.includes("hello") ||
    m.includes("qué puedes hacer") ||
    m.includes("que puedes hacer") ||
    m.includes("ayuda") ||
    m.includes("help")
  ) {
    return "general_chat";
  }

  return "unknown";
}
