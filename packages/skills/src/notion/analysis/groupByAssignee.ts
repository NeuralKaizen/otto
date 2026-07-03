import type { NormalizedNotionTask } from "../types.js";

export function groupByAssignee(tasks: NormalizedNotionTask[]): Record<string, NormalizedNotionTask[]> {
  const groups: Record<string, NormalizedNotionTask[]> = {};
  for (const task of tasks) {
    const assignees = task.assignees.length > 0 ? task.assignees : ["Sin asignar"];
    for (const assignee of assignees) {
      (groups[assignee] ??= []).push(task);
    }
  }
  return groups;
}

export function groupByProject(tasks: NormalizedNotionTask[]): Record<string, NormalizedNotionTask[]> {
  const groups: Record<string, NormalizedNotionTask[]> = {};
  for (const task of tasks) {
    const project = task.projectName ?? "Sin proyecto";
    (groups[project] ??= []).push(task);
  }
  return groups;
}
