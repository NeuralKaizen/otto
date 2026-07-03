import type {
  NormalizedNotionProject,
  NormalizedNotionTask,
  NotionProjectAdapter,
  NotionProjectIntelligenceRequest,
} from "../types.js";
import { isCompletedStatus, isBlockedStatus } from "../notionNormalizer.js";
import { isTaskOverdue } from "../analysis/detectOverdue.js";

interface MockTaskSeed {
  id: string;
  title: string;
  status: string;
  assignees: string[];
  /** Days relative to today (negative = past / overdue, null = no due date). */
  dueOffsetDays: number | null;
  projectName: string;
  priority: string;
}

interface MockProjectSeed {
  id: string;
  title: string;
  status: string;
  owner?: string;
  /** Explicit Progress property (0-100). If omitted, progress is computed from related tasks. */
  progress?: number;
  dueOffsetDays: number | null;
}

// 5 people x mixed pending/completed/blocked/overdue/no-date tasks across 5 projects.
const TASK_SEEDS: MockTaskSeed[] = [
  { id: "task-001", title: "Configurar WebSocket reconnect", status: "In Progress", assignees: ["Daniel"], dueOffsetDays: 3, projectName: "Wattson", priority: "Medium" },
  { id: "task-002", title: "Revisar CRM Notion", status: "To Do", assignees: ["Daniel"], dueOffsetDays: -3, projectName: "CRM Notion", priority: "High" },
  { id: "task-003", title: "Preparar resumen de leads", status: "To Do", assignees: ["Daniel"], dueOffsetDays: null, projectName: "Acelera", priority: "Low" },
  { id: "task-004", title: "Diseñar onboarding de voz", status: "Blocked", assignees: ["Daniel"], dueOffsetDays: 12, projectName: "Wattson", priority: "Medium" },
  { id: "task-005", title: "Documentar API de Social Metrics", status: "To Do", assignees: ["Daniel", "Pablo"], dueOffsetDays: 5, projectName: "Social Metrics", priority: "Low" },

  { id: "task-006", title: "Implementar autenticación OAuth de Notion", status: "To Do", assignees: ["Pablo"], dueOffsetDays: 1, projectName: "CRM Notion", priority: "High" },
  { id: "task-007", title: "Refactor del executor", status: "In Progress", assignees: ["Pablo"], dueOffsetDays: null, projectName: "Wattson", priority: "Medium" },
  { id: "task-008", title: "Revisión de seguridad del approval flow", status: "Done", assignees: ["Pablo"], dueOffsetDays: -10, projectName: "Wattson", priority: "High" },
  { id: "task-009", title: "Preparar demo para Houston", status: "Blocked", assignees: ["Pablo"], dueOffsetDays: -1, projectName: "Houston", priority: "High" },
  { id: "task-010", title: "Actualizar dependencias", status: "To Do", assignees: ["Pablo"], dueOffsetDays: 14, projectName: "Wattson", priority: "Low" },

  { id: "task-011", title: "Bundle del API como Tauri sidecar", status: "To Do", assignees: ["Jose"], dueOffsetDays: 7, projectName: "Wattson", priority: "High" },
  { id: "task-012", title: "Configurar ElevenLabs TTS", status: "To Do", assignees: ["Jose"], dueOffsetDays: null, projectName: "Wattson", priority: "Medium" },
  { id: "task-013", title: "Plan de integraciones Notion fase 2", status: "In Progress", assignees: ["Jose"], dueOffsetDays: 4, projectName: "Wattson", priority: "Medium" },
  { id: "task-014", title: "QA general del MVP", status: "Done", assignees: ["Jose"], dueOffsetDays: -5, projectName: "Wattson", priority: "Medium" },
  { id: "task-015", title: "Preparar pitch para Acelera", status: "To Do", assignees: ["Jose", "María"], dueOffsetDays: -2, projectName: "Acelera", priority: "High" },

  { id: "task-016", title: "Levantamiento de requerimientos del CRM", status: "Done", assignees: ["María"], dueOffsetDays: -15, projectName: "CRM Notion", priority: "Medium" },
  { id: "task-017", title: "Diseño UI del dashboard de Social Metrics", status: "In Progress", assignees: ["María"], dueOffsetDays: 6, projectName: "Social Metrics", priority: "Medium" },
  { id: "task-018", title: "Reunión de seguimiento con Houston", status: "To Do", assignees: ["María"], dueOffsetDays: 1, projectName: "Houston", priority: "Low" },
  { id: "task-019", title: "Auditoría de datos de leads", status: "Blocked", assignees: ["María"], dueOffsetDays: null, projectName: "Acelera", priority: "High" },

  { id: "task-020", title: "Migrar base de datos a Postgres", status: "To Do", assignees: ["Camilo"], dueOffsetDays: 30, projectName: "Wattson", priority: "Low" },
  { id: "task-021", title: "Documentar arquitectura de Houston", status: "Done", assignees: ["Camilo"], dueOffsetDays: -20, projectName: "Houston", priority: "Medium" },
  { id: "task-022", title: "Pruebas de carga del API", status: "In Progress", assignees: ["Camilo"], dueOffsetDays: 8, projectName: "Wattson", priority: "Medium" },
  { id: "task-023", title: "Resolver bug de cancelación de streaming", status: "To Do", assignees: ["Camilo"], dueOffsetDays: -1, projectName: "Wattson", priority: "High" },
  { id: "task-024", title: "Preparar onboarding para nuevo developer", status: "To Do", assignees: ["Camilo", "Pablo"], dueOffsetDays: 2, projectName: "Acelera", priority: "Low" },
];

const PROJECT_SEEDS: MockProjectSeed[] = [
  { id: "project-wattson", title: "Wattson", status: "In Progress", owner: "Jose", dueOffsetDays: 60 },
  { id: "project-acelera", title: "Acelera", status: "In Progress", owner: "María", progress: 45, dueOffsetDays: 20 },
  { id: "project-houston", title: "Houston", status: "On Hold", owner: "Pablo", dueOffsetDays: -5 },
  { id: "project-crm-notion", title: "CRM Notion", status: "In Progress", owner: "Daniel", dueOffsetDays: 10 },
  { id: "project-social-metrics", title: "Social Metrics", status: "To Do", dueOffsetDays: 15 },
];

function dateOffset(days: number | null): string | undefined {
  if (days === null) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildMockTasks(): NormalizedNotionTask[] {
  const now = new Date().toISOString();
  return TASK_SEEDS.map((seed) => {
    const isCompleted = isCompletedStatus(seed.status);
    const isBlocked = isBlockedStatus(seed.status);
    const dueDate = dateOffset(seed.dueOffsetDays);
    return {
      id: seed.id,
      title: seed.title,
      status: seed.status,
      assignees: seed.assignees,
      dueDate,
      projectName: seed.projectName,
      priority: seed.priority,
      url: `https://notion.so/mock-${seed.id}`,
      isCompleted,
      isBlocked,
      isOverdue: isTaskOverdue(dueDate, isCompleted),
      lastEditedTime: now,
      dataSource: "mock",
    };
  });
}

function buildMockProjects(): NormalizedNotionProject[] {
  const now = new Date().toISOString();
  return PROJECT_SEEDS.map((seed) => ({
    id: seed.id,
    title: seed.title,
    status: seed.status,
    owner: seed.owner,
    progress: seed.progress,
    dueDate: dateOffset(seed.dueOffsetDays),
    url: `https://notion.so/mock-${seed.id}`,
    lastEditedTime: now,
    dataSource: "mock",
  }));
}

/**
 * Deterministic in-memory dataset covering 5 people and 5 projects with a mix
 * of pending/completed/blocked/overdue/no-date tasks. Used whenever Notion
 * is not configured, or as a fallback for whichever database (tasks/projects)
 * is missing its ID.
 */
class NotionMockAdapter implements NotionProjectAdapter {
  isAvailable(): boolean {
    return true;
  }

  async queryTasks(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionTask[]> {
    return buildMockTasks();
  }

  async queryProjects(_request: NotionProjectIntelligenceRequest): Promise<NormalizedNotionProject[]> {
    return buildMockProjects();
  }
}

export const notionMockAdapter = new NotionMockAdapter();
