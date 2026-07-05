import type { NormalizedNotionProject, NormalizedNotionTask } from "../types.js";

export interface ProjectProgressResult {
  progress?: number;
  limitation?: string;
}

/**
 * Resolves a project's completion percentage.
 * Prefers an explicit `Progress` number property; otherwise derives it from
 * related tasks (`completed / total * 100`). If neither is available, returns
 * `undefined` with an explanatory limitation.
 */
export function computeProjectProgress(
  project: NormalizedNotionProject,
  relatedTasks: NormalizedNotionTask[]
): ProjectProgressResult {
  if (project.progress !== undefined) {
    return { progress: project.progress };
  }

  if (relatedTasks.length === 0) {
    return {
      progress: undefined,
      limitation: `No se pudo calcular el progreso de "${project.title}": no tiene una propiedad Progress y no se encontraron tareas relacionadas.`,
    };
  }

  const completed = relatedTasks.filter((t) => t.isCompleted).length;
  return { progress: Math.round((completed / relatedTasks.length) * 100) };
}
