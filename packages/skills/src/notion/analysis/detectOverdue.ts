import type { NormalizedNotionTask } from "../types.js";

/** A task is overdue if it has a due date strictly before today (00:00) and is not completed. */
export function isTaskOverdue(dueDate: string | undefined, isCompleted: boolean): boolean {
  if (!dueDate || isCompleted) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return due.getTime() < todayStart.getTime();
}

export function filterOverdueTasks(tasks: NormalizedNotionTask[]): NormalizedNotionTask[] {
  return tasks.filter((t) => t.isOverdue);
}

/** A date falls within the next 7 days (inclusive of today). */
export function isDueThisWeek(dueDate: string | undefined): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return due.getTime() >= startOfToday.getTime() && due.getTime() < endOfWeek.getTime();
}
