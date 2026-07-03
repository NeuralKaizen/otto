import type { NormalizedNotionProject, NormalizedNotionTask, ProjectSummary } from "../types.js";
import { computeProjectProgress } from "./computeProjectProgress.js";

/**
 * Builds a status summary for a project, including computed/declared progress,
 * task stats (own or derived from `relatedTasks`), and risk callouts.
 */
export function summarizeProject(
  project: NormalizedNotionProject,
  relatedTasks: NormalizedNotionTask[]
): ProjectSummary {
  const { progress, limitation } = computeProjectProgress(project, relatedTasks);

  const taskStats =
    relatedTasks.length > 0
      ? {
          total: relatedTasks.length,
          completed: relatedTasks.filter((t) => t.isCompleted).length,
          pending: relatedTasks.filter((t) => !t.isCompleted).length,
          blocked: relatedTasks.filter((t) => t.isBlocked).length,
          overdue: relatedTasks.filter((t) => t.isOverdue).length,
        }
      : project.taskStats;

  const risks: string[] = [];

  if (taskStats) {
    if (taskStats.overdue === 1) {
      risks.push(`Hay 1 tarea vencida en "${project.title}".`);
    } else if (taskStats.overdue >= 2) {
      risks.push(`Hay ${taskStats.overdue} tareas vencidas en "${project.title}".`);
    }

    if (taskStats.blocked >= 1) {
      risks.push(`${taskStats.blocked} tarea(s) bloqueada(s) en "${project.title}" — pueden frenar el avance.`);
    }

    const noDueDate = relatedTasks.filter((t) => !t.isCompleted && !t.dueDate).length;
    if (noDueDate >= 2) {
      risks.push(`${noDueDate} tareas pendientes de "${project.title}" no tienen fecha límite definida.`);
    }
  }

  if (!project.owner) {
    risks.push(`El proyecto "${project.title}" no tiene un responsable (Owner) asignado.`);
  }

  return { status: project.status, progress, progressLimitation: limitation, taskStats, risks };
}
