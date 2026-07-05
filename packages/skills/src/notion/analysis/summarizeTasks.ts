import type { NormalizedNotionTask, TaskSummary } from "../types.js";
import { groupByAssignee, groupByProject } from "./groupByAssignee.js";
import { isDueThisWeek } from "./detectOverdue.js";

export function summarizeTasks(tasks: NormalizedNotionTask[]): TaskSummary {
  return {
    total: tasks.length,
    pending: tasks.filter((t) => !t.isCompleted).length,
    completed: tasks.filter((t) => t.isCompleted).length,
    overdue: tasks.filter((t) => t.isOverdue).length,
    blocked: tasks.filter((t) => t.isBlocked).length,
    upcoming: tasks.filter((t) => !t.isCompleted && isDueThisWeek(t.dueDate)).length,
    byAssignee: groupByAssignee(tasks),
    byProject: groupByProject(tasks),
  };
}
