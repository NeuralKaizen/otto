import type { SkillDefinition, SkillContext } from "../types.js";
import type {
  NormalizedNotionProject,
  NormalizedNotionTask,
  NotionProjectIntelligenceRequest,
  NotionProjectIntelligenceResponse,
} from "./types.js";
import { parseNotionQuery } from "./notionParser.js";
import { notionMockAdapter } from "./adapters/notionMockAdapter.js";
import { notionRealAdapter } from "./adapters/notionRealAdapter.js";
import { isNotionTasksAvailable, isNotionProjectsAvailable } from "./notionConfig.js";
import { normalizeName } from "./notionNormalizer.js";
import { summarizeProject } from "./analysis/summarizeProjects.js";
import { summarizeTasks } from "./analysis/summarizeTasks.js";
import { isDueThisWeek } from "./analysis/detectOverdue.js";
import { groupByAssignee, groupByProject } from "./analysis/groupByAssignee.js";
import { NotionQueryError } from "./notionClient.js";

interface NotionSkillInput {
  message: string;
}

type DataSource = "notion_api" | "mock";

const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const REAL_LABEL = "Datos consultados desde Notion.";
const MOCK_LABEL = "Estos datos son simulados porque Notion no está configurado todavía.";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Data loading — selects real adapter when configured, falls back to mock and
// records a limitation if Notion is enabled but the query fails.
// ---------------------------------------------------------------------------

async function loadTasks(
  request: NotionProjectIntelligenceRequest
): Promise<{ tasks: NormalizedNotionTask[]; dataSource: DataSource; limitations: string[] }> {
  if (!isNotionTasksAvailable()) {
    return { tasks: await notionMockAdapter.queryTasks(request), dataSource: "mock", limitations: [] };
  }

  try {
    const tasks = await notionRealAdapter.queryTasks(request);
    return { tasks, dataSource: "notion_api", limitations: [] };
  } catch (err) {
    const message = err instanceof NotionQueryError ? err.message : String(err);
    const tasks = await notionMockAdapter.queryTasks(request);
    return {
      tasks,
      dataSource: "mock",
      limitations: [`No se pudo consultar la base de tareas en Notion (${message}). Mostrando datos simulados.`],
    };
  }
}

async function loadProjects(
  request: NotionProjectIntelligenceRequest
): Promise<{ projects: NormalizedNotionProject[]; dataSource: DataSource; limitations: string[] }> {
  if (!isNotionProjectsAvailable()) {
    return { projects: await notionMockAdapter.queryProjects(request), dataSource: "mock", limitations: [] };
  }

  try {
    const projects = await notionRealAdapter.queryProjects(request);
    return { projects, dataSource: "notion_api", limitations: [] };
  } catch (err) {
    const message = err instanceof NotionQueryError ? err.message : String(err);
    const projects = await notionMockAdapter.queryProjects(request);
    return {
      projects,
      dataSource: "mock",
      limitations: [`No se pudo consultar la base de proyectos en Notion (${message}). Mostrando datos simulados.`],
    };
  }
}

/** Replaces relation-based project IDs on tasks with the matching project's title. */
function resolveTaskProjectNames(
  tasks: NormalizedNotionTask[],
  projects: NormalizedNotionProject[]
): NormalizedNotionTask[] {
  if (projects.length === 0) return tasks;
  const idToTitle = new Map(projects.map((p) => [p.id, p.title]));

  return tasks.map((task) => {
    if (task.projectName && UUID_PATTERN.test(task.projectName)) {
      const title = idToTitle.get(task.projectName);
      if (title) return { ...task, projectName: title };
    }
    return task;
  });
}

function combineDataSource(a: DataSource, b: DataSource): "notion_api" | "mock" | "mixed" {
  return a === b ? a : "mixed";
}

// ---------------------------------------------------------------------------
// Filtering — local filtering by person/project/due-range, since Notion
// filters depend on per-workspace property types.
// ---------------------------------------------------------------------------

/** True if a normalized name/title matches the target — exact match or a whole-word-token match, so "Jose" matches "Jose Fonseca" and "Acelera" matches "Acelera Talent". */
function matchesNameToken(fullName: string, normalizedTarget: string): boolean {
  const normalizedFull = normalizeName(fullName);
  if (normalizedFull === normalizedTarget) return true;
  return normalizedFull.split(/\s+/).includes(normalizedTarget);
}

function filterByPerson(tasks: NormalizedNotionTask[], personName: string): NormalizedNotionTask[] {
  const target = normalizeName(personName);
  return tasks.filter((t) => t.assignees.some((a) => matchesNameToken(a, target)));
}

function filterByProject(tasks: NormalizedNotionTask[], projectName: string): NormalizedNotionTask[] {
  const target = normalizeName(projectName);
  return tasks.filter((t) => t.projectName && matchesNameToken(t.projectName, target));
}

function filterByDueRange(
  tasks: NormalizedNotionTask[],
  dueRange: NotionProjectIntelligenceRequest["dueRange"]
): NormalizedNotionTask[] {
  switch (dueRange) {
    case "overdue":
      return tasks.filter((t) => t.isOverdue);
    case "this_week":
      return tasks.filter((t) => isDueThisWeek(t.dueDate));
    case "today":
      return tasks.filter((t) => t.dueDate === todayISO());
    case "upcoming":
      return tasks.filter((t) => !t.isCompleted && Boolean(t.dueDate) && !t.isOverdue);
    default:
      return tasks;
  }
}

function sortTasks(tasks: NormalizedNotionTask[]): NormalizedNotionTask[] {
  return [...tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDueLabel(task: NormalizedNotionTask): string {
  if (task.isOverdue) return "vencida";
  if (!task.dueDate) return "sin fecha";
  const date = new Date(`${task.dueDate}T00:00:00`);
  if (isDueThisWeek(task.dueDate)) {
    return `vence el ${date.toLocaleDateString("es-ES", { weekday: "long" })}`;
  }
  return `vence el ${date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
}

function formatTaskLine(index: number, task: NormalizedNotionTask, includeAssignees = false): string {
  const project = task.projectName ? ` — ${task.projectName}` : "";
  const assignees = includeAssignees && task.assignees.length > 0 ? ` — ${task.assignees.join(", ")}` : "";
  return `${index}. ${task.title}${project}${assignees} — ${formatDueLabel(task)}`;
}

function sourceLine(dataSource: DataSource): string {
  return dataSource === "mock" ? MOCK_LABEL : REAL_LABEL;
}

// ---------------------------------------------------------------------------
// Per-intent response builders
// ---------------------------------------------------------------------------

function buildClarificationResponse(
  request: NotionProjectIntelligenceRequest,
  question: string,
  recommendations: string[]
): NotionProjectIntelligenceResponse {
  return {
    request,
    tasks: [],
    projects: [],
    summary: question,
    insights: [],
    recommendations,
    limitations: [],
    dataSource: isNotionTasksAvailable() || isNotionProjectsAvailable() ? "notion_api" : "mock",
  };
}

function buildPersonResponse(
  request: NotionProjectIntelligenceRequest,
  personName: string,
  tasks: NormalizedNotionTask[],
  dataSource: DataSource,
  limitations: string[]
): NotionProjectIntelligenceResponse {
  const lines: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (tasks.length === 0) {
    lines.push(`No encontré tareas pendientes para ${personName} en Notion.`);
    lines.push("");
    lines.push(sourceLine(dataSource));
    return {
      request,
      tasks: [],
      projects: [],
      summary: lines.join("\n"),
      insights,
      recommendations,
      limitations,
      dataSource,
    };
  }

  const sorted = sortTasks(tasks);
  const overdue = sorted.filter((t) => t.isOverdue);
  const blocked = sorted.filter((t) => t.isBlocked);
  const noDueDate = sorted.filter((t) => !t.dueDate);

  lines.push(
    `Encontré ${sorted.length} ${pluralize(sorted.length, "tarea pendiente", "tareas pendientes")} para ${personName} en Notion.`
  );
  lines.push("");
  lines.push("Pendientes principales:");
  sorted.slice(0, 5).forEach((t, i) => lines.push(formatTaskLine(i + 1, t)));

  if (overdue.length > 0 || blocked.length > 0) {
    lines.push("");
    lines.push("Riesgos:");
    if (overdue.length > 0) {
      lines.push(`- ${overdue.length} ${pluralize(overdue.length, "tarea vencida", "tareas vencidas")}.`);
      insights.push(`${personName} tiene ${overdue.length} ${pluralize(overdue.length, "tarea vencida", "tareas vencidas")}.`);
    }
    if (blocked.length > 0) {
      lines.push(`- ${blocked.length} ${pluralize(blocked.length, "tarea bloqueada", "tareas bloqueadas")}.`);
      insights.push(`${personName} tiene ${blocked.length} ${pluralize(blocked.length, "tarea bloqueada", "tareas bloqueadas")}.`);
    }
  }

  lines.push("");
  lines.push("Recomendación:");
  if (overdue.length > 0 && noDueDate.length > 0) {
    const rec = `Priorizar ${pluralize(overdue.length, "la tarea vencida", "las tareas vencidas")} y definir fecha para las tareas sin deadline.`;
    lines.push(rec);
    recommendations.push(rec);
  } else if (overdue.length > 0) {
    const rec = `Priorizar ${pluralize(overdue.length, "la tarea vencida", "las tareas vencidas")} de ${personName} antes de continuar con el resto.`;
    lines.push(rec);
    recommendations.push(rec);
  } else if (blocked.length > 0) {
    const rec = `Resolver ${pluralize(blocked.length, "el bloqueo", "los bloqueos")} de ${personName} para no frenar el avance.`;
    lines.push(rec);
    recommendations.push(rec);
  } else if (noDueDate.length > 0) {
    const rec = `Definir fecha límite para ${noDueDate.length} ${pluralize(noDueDate.length, "tarea sin deadline", "tareas sin deadline")}.`;
    lines.push(rec);
    recommendations.push(rec);
  } else {
    const rec = "Continuar con el plan actual — no se detectaron riesgos importantes.";
    lines.push(rec);
    recommendations.push(rec);
  }

  lines.push("");
  lines.push(sourceLine(dataSource));

  return {
    request,
    tasks: sorted,
    projects: [],
    summary: lines.join("\n"),
    insights,
    recommendations,
    limitations,
    dataSource,
  };
}

function buildProjectResponse(
  request: NotionProjectIntelligenceRequest,
  project: NormalizedNotionProject,
  relatedTasks: NormalizedNotionTask[],
  dataSource: "notion_api" | "mock" | "mixed",
  limitations: string[]
): NotionProjectIntelligenceResponse {
  const summary = summarizeProject(project, relatedTasks);
  const lines: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (summary.progress !== undefined) {
    lines.push(`El proyecto ${project.title} está aproximadamente en ${summary.progress}% de avance.`);
  } else {
    lines.push(`No pude determinar el porcentaje de avance del proyecto ${project.title}.`);
    if (summary.progressLimitation) limitations.push(summary.progressLimitation);
  }

  if (summary.taskStats) {
    lines.push("");
    lines.push("Estado:");
    lines.push(`- ${summary.taskStats.total} tareas totales`);
    lines.push(`- ${summary.taskStats.completed} completadas`);
    lines.push(`- ${summary.taskStats.pending} pendientes`);
    if (summary.taskStats.blocked > 0) {
      lines.push(`- ${summary.taskStats.blocked} ${pluralize(summary.taskStats.blocked, "bloqueada", "bloqueadas")}`);
    }
    if (summary.taskStats.overdue > 0) {
      lines.push(`- ${summary.taskStats.overdue} ${pluralize(summary.taskStats.overdue, "vencida", "vencidas")}`);
    }
  } else {
    limitations.push(`No hay tareas asociadas a "${project.title}" para calcular estadísticas.`);
  }

  if (summary.risks.length > 0) {
    lines.push("");
    lines.push(summary.risks.length === 1 ? "Riesgo principal:" : "Riesgos:");
    for (const risk of summary.risks) {
      lines.push(summary.risks.length === 1 ? risk : `- ${risk}`);
      insights.push(risk);
    }
  }

  lines.push("");
  lines.push("Siguiente paso sugerido:");
  if (summary.taskStats && summary.taskStats.blocked > 0) {
    const rec = "Cerrar la(s) tarea(s) bloqueada(s) antes de seguir avanzando.";
    lines.push(rec);
    recommendations.push(rec);
  } else if (summary.taskStats && summary.taskStats.overdue > 0) {
    const rec = "Resolver las tareas vencidas para no afectar el cronograma.";
    lines.push(rec);
    recommendations.push(rec);
  } else {
    const rec = "Continuar con el plan actual.";
    lines.push(rec);
    recommendations.push(rec);
  }

  lines.push("");
  lines.push(sourceLine(dataSource === "mixed" ? "notion_api" : dataSource));
  if (dataSource === "mixed") {
    lines.push("(Tareas y proyectos provienen de fuentes distintas — revisa las limitaciones.)");
  }

  return {
    request,
    tasks: sortTasks(relatedTasks),
    projects: [project],
    summary: lines.join("\n"),
    insights,
    recommendations,
    limitations,
    dataSource,
  };
}

function buildTaskListResponse(
  request: NotionProjectIntelligenceRequest,
  tasks: NormalizedNotionTask[],
  dataSource: DataSource,
  limitations: string[],
  opts: { kind: "overdue" | "blocked" }
): NotionProjectIntelligenceResponse {
  const lines: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];
  const label = opts.kind === "overdue" ? "vencida" : "bloqueada";
  const labelPlural = opts.kind === "overdue" ? "vencidas" : "bloqueadas";

  const scope: string[] = [];
  if (request.personName) scope.push(`para ${request.personName}`);
  if (request.projectName) scope.push(`en el proyecto ${request.projectName}`);
  const scopeText = scope.length > 0 ? ` ${scope.join(" ")}` : "";

  if (tasks.length === 0) {
    lines.push(`No encontré tareas ${labelPlural}${scopeText}.`);
    lines.push("");
    lines.push(sourceLine(dataSource));
    return { request, tasks: [], projects: [], summary: lines.join("\n"), insights, recommendations, limitations, dataSource };
  }

  const sorted = sortTasks(tasks);
  lines.push(`Encontré ${sorted.length} ${pluralize(sorted.length, `tarea ${label}`, `tareas ${labelPlural}`)}${scopeText}.`);
  lines.push("");
  lines.push(`${opts.kind === "overdue" ? "Vencidas" : "Bloqueadas"}:`);
  sorted.slice(0, 10).forEach((t, i) => lines.push(formatTaskLine(i + 1, t, true)));

  const byAssignee = groupByAssignee(sorted);
  const peopleAffected = Object.keys(byAssignee).filter((p) => p !== "Sin asignar");
  if (peopleAffected.length > 0) {
    insights.push(`Personas con ${labelPlural}: ${peopleAffected.join(", ")}.`);
  }

  if (opts.kind === "overdue") {
    const byProject = groupByProject(sorted);
    const projectsAffected = Object.keys(byProject).filter((p) => p !== "Sin proyecto");
    if (projectsAffected.length > 0) {
      insights.push(`Proyectos con tareas vencidas: ${projectsAffected.join(", ")}.`);
    }
  }

  lines.push("");
  lines.push("Recomendación:");
  const rec =
    opts.kind === "overdue"
      ? "Priorizar estas tareas o redefinir sus fechas si ya no aplican."
      : "Identificar y resolver el motivo del bloqueo con cada responsable.";
  lines.push(rec);
  recommendations.push(rec);

  lines.push("");
  lines.push(sourceLine(dataSource));

  return { request, tasks: sorted, projects: [], summary: lines.join("\n"), insights, recommendations, limitations, dataSource };
}

function buildBriefingResponse(
  request: NotionProjectIntelligenceRequest,
  tasks: NormalizedNotionTask[],
  dataSource: DataSource,
  limitations: string[]
): NotionProjectIntelligenceResponse {
  const lines: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  const pending = tasks.filter((t) => !t.isCompleted);
  const byAssignee = groupByAssignee(pending);
  const people = Object.keys(byAssignee).sort();

  lines.push(`Daily briefing — ${pending.length} ${pluralize(pending.length, "tarea pendiente", "tareas pendientes")} en total.`);
  lines.push("");

  let totalOverdue = 0;
  let totalBlocked = 0;

  for (const person of people) {
    const personTasks = byAssignee[person];
    const overdue = personTasks.filter((t) => t.isOverdue).length;
    const blocked = personTasks.filter((t) => t.isBlocked).length;
    totalOverdue += overdue;
    totalBlocked += blocked;

    const flags: string[] = [];
    if (overdue > 0) flags.push(`${overdue} ${pluralize(overdue, "vencida", "vencidas")}`);
    if (blocked > 0) flags.push(`${blocked} ${pluralize(blocked, "bloqueada", "bloqueadas")}`);
    const flagsText = flags.length > 0 ? ` (${flags.join(", ")})` : "";

    lines.push(`- ${person}: ${personTasks.length} ${pluralize(personTasks.length, "pendiente", "pendientes")}${flagsText}`);
  }

  if (totalOverdue > 0) insights.push(`${totalOverdue} ${pluralize(totalOverdue, "tarea vencida", "tareas vencidas")} en total.`);
  if (totalBlocked > 0) insights.push(`${totalBlocked} ${pluralize(totalBlocked, "tarea bloqueada", "tareas bloqueadas")} en total.`);

  lines.push("");
  lines.push("Recomendación:");
  const rec =
    totalOverdue > 0 || totalBlocked > 0
      ? "Revisar primero las tareas vencidas y bloqueadas antes de iniciar nuevo trabajo."
      : "Sin riesgos críticos hoy — continuar con el plan del día.";
  lines.push(rec);
  recommendations.push(rec);

  lines.push("");
  lines.push(sourceLine(dataSource));

  return { request, tasks: sortTasks(pending), projects: [], summary: lines.join("\n"), insights, recommendations, limitations, dataSource };
}

function buildOverviewResponse(
  request: NotionProjectIntelligenceRequest,
  tasks: NormalizedNotionTask[],
  projects: NormalizedNotionProject[],
  dataSource: "notion_api" | "mock" | "mixed",
  limitations: string[]
): NotionProjectIntelligenceResponse {
  const lines: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];
  const sourceDataSource = dataSource === "mixed" ? "notion_api" : dataSource;

  if (projects.length === 0 && tasks.length === 0) {
    lines.push("No encontré proyectos ni tareas en Notion.");
    lines.push("");
    lines.push(sourceLine(sourceDataSource));
    return { request, tasks: [], projects: [], summary: lines.join("\n"), insights, recommendations, limitations, dataSource };
  }

  const taskStats = summarizeTasks(tasks);

  lines.push(
    `Resumen general de Notion: ${projects.length} ${pluralize(projects.length, "proyecto", "proyectos")} y ${taskStats.total} ${pluralize(taskStats.total, "tarea", "tareas")} en total.`
  );
  lines.push(
    `- ${taskStats.pending} ${pluralize(taskStats.pending, "pendiente", "pendientes")}, ${taskStats.completed} ${pluralize(taskStats.completed, "completada", "completadas")}.`
  );
  if (taskStats.overdue > 0) {
    lines.push(`- ${taskStats.overdue} ${pluralize(taskStats.overdue, "tarea vencida", "tareas vencidas")}.`);
  }
  if (taskStats.blocked > 0) {
    lines.push(`- ${taskStats.blocked} ${pluralize(taskStats.blocked, "tarea bloqueada", "tareas bloqueadas")}.`);
  }

  const atRiskProjects: string[] = [];

  if (projects.length > 0) {
    lines.push("");
    lines.push("Proyectos:");
    for (const project of projects) {
      const relatedTasks = tasks.filter(
        (t) => t.projectName && normalizeName(t.projectName) === normalizeName(project.title)
      );
      const summary = summarizeProject(project, relatedTasks);
      const statusLabel = summary.status ?? "sin estado";
      const progressLabel = summary.progress !== undefined ? ` — ${summary.progress}% completado` : "";
      const ownerLabel = project.owner ? ` — responsable: ${project.owner}` : "";
      lines.push(`- ${project.title}: ${statusLabel}${progressLabel}${ownerLabel}`);
      if (summary.risks.length > 0) atRiskProjects.push(project.title);
    }
  }

  if (atRiskProjects.length > 0) {
    lines.push("");
    lines.push(`Proyectos con observaciones pendientes: ${atRiskProjects.join(", ")}.`);
    insights.push(
      `${atRiskProjects.length} de ${projects.length} ${pluralize(projects.length, "proyecto tiene", "proyectos tienen")} observaciones pendientes (vencidas, bloqueadas, sin responsable o sin fecha límite).`
    );
  }

  lines.push("");
  lines.push("Recomendación:");
  let rec: string;
  if (taskStats.overdue > 0) {
    rec = `Priorizar las ${taskStats.overdue} ${pluralize(taskStats.overdue, "tarea vencida", "tareas vencidas")} antes de avanzar con trabajo nuevo.`;
  } else if (taskStats.blocked > 0) {
    rec = `Resolver ${taskStats.blocked} ${pluralize(taskStats.blocked, "tarea bloqueada", "tareas bloqueadas")} para destrabar el avance.`;
  } else if (atRiskProjects.length > 0) {
    rec = `Revisar ${atRiskProjects.length === 1 ? "el proyecto" : "los proyectos"} con observaciones pendientes: ${atRiskProjects.join(", ")}.`;
  } else {
    rec = "Sin riesgos críticos detectados — continuar con el plan actual.";
  }
  lines.push(rec);
  recommendations.push(rec);

  lines.push("");
  lines.push(sourceLine(sourceDataSource));
  if (dataSource === "mixed") {
    lines.push("(Tareas y proyectos provienen de fuentes distintas — revisa las limitaciones.)");
  }

  return {
    request,
    tasks: [],
    projects,
    summary: lines.join("\n"),
    insights,
    recommendations,
    limitations,
    dataSource,
  };
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const notionProjectSkill: SkillDefinition<NotionSkillInput, NotionProjectIntelligenceResponse> = {
  name: "notion_project_intelligence",
  description: "Consulta tareas y proyectos en Notion en modo solo lectura y genera resúmenes de avance, pendientes, vencidas y bloqueadas.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  requiresApproval: false,
  riskLevel: "low",
  permissions: ["notion.read"],

  async execute(args: NotionSkillInput, _ctx: SkillContext): Promise<NotionProjectIntelligenceResponse> {
    const request = parseNotionQuery(args.message);

    if (request.intent === "tasks_by_person" && !request.personName) {
      return buildClarificationResponse(request, "¿De qué persona quieres revisar las tareas pendientes?", []);
    }

    if (request.intent === "tasks_by_project" && !request.projectName) {
      return buildClarificationResponse(request, "¿De qué proyecto quieres ver las tareas pendientes?", []);
    }

    if (request.intent === "project_status" && !request.projectName) {
      return buildClarificationResponse(request, "¿De qué proyecto quieres conocer el estado o avance?", []);
    }

    // Both databases are always loaded: tasks need `projects` to resolve
    // relation-based "Project" properties, and project_status needs `tasks`
    // to compute taskStats/progress.
    const [tasksResult, projectsResult] = await Promise.all([loadTasks(request), loadProjects(request)]);

    const allTasks = resolveTaskProjectNames(tasksResult.tasks, projectsResult.projects);
    const limitations = [...tasksResult.limitations, ...projectsResult.limitations];

    switch (request.intent) {
      case "tasks_by_person": {
        const personName = request.personName!;
        let tasks = filterByPerson(allTasks, personName);
        tasks = filterByDueRange(tasks, request.dueRange);
        if (!request.includeCompleted) tasks = tasks.filter((t) => !t.isCompleted);

        const personLimitations = [...limitations];
        const knownAssignees = allTasks.flatMap((t) => t.assignees);
        const targetName = normalizeName(personName);
        if (!knownAssignees.some((a) => matchesNameToken(a, targetName))) {
          personLimitations.push(
            `No se encontró a "${personName}" entre los responsables de las tareas. Verifica el nombre o la propiedad Assignee en Notion.`
          );
        }

        return buildPersonResponse(request, personName, tasks, tasksResult.dataSource, personLimitations);
      }

      case "tasks_by_project": {
        const projectName = request.projectName!;
        let tasks = filterByProject(allTasks, projectName);
        tasks = filterByDueRange(tasks, request.dueRange);
        if (!request.includeCompleted) tasks = tasks.filter((t) => !t.isCompleted);

        return buildPersonResponse(request, `el proyecto ${projectName}`, tasks, tasksResult.dataSource, limitations);
      }

      case "project_status": {
        const projectName = request.projectName!;
        const target = normalizeName(projectName);
        const project = projectsResult.projects.find((p) => matchesNameToken(p.title, target));

        if (!project) {
          const available = projectsResult.projects.map((p) => p.title).join(", ") || "ninguno disponible";
          return buildClarificationResponse(
            request,
            `No encontré el proyecto "${projectName}" en Notion. Proyectos disponibles: ${available}.`,
            []
          );
        }

        const relatedTasks = allTasks.filter((t) => t.projectName && normalizeName(t.projectName) === normalizeName(project.title));
        const dataSource = combineDataSource(tasksResult.dataSource, projectsResult.dataSource);
        return buildProjectResponse(request, project, relatedTasks, dataSource, limitations);
      }

      case "overdue_tasks": {
        let tasks = filterByDueRange(allTasks, "overdue");
        if (request.personName) tasks = filterByPerson(tasks, request.personName);
        if (request.projectName) tasks = filterByProject(tasks, request.projectName);
        return buildTaskListResponse(request, tasks, tasksResult.dataSource, limitations, { kind: "overdue" });
      }

      case "blocked_tasks": {
        let tasks = allTasks.filter((t) => t.isBlocked);
        if (request.personName) tasks = filterByPerson(tasks, request.personName);
        if (request.projectName) tasks = filterByProject(tasks, request.projectName);
        return buildTaskListResponse(request, tasks, tasksResult.dataSource, limitations, { kind: "blocked" });
      }

      case "daily_task_briefing": {
        return buildBriefingResponse(request, allTasks, tasksResult.dataSource, limitations);
      }

      case "workspace_overview": {
        const dataSource = combineDataSource(tasksResult.dataSource, projectsResult.dataSource);
        return buildOverviewResponse(request, allTasks, projectsResult.projects, dataSource, limitations);
      }
    }
  },
};
