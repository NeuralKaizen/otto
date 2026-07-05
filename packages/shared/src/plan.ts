import type { Intent } from "./intents.js";

export interface AgentPlan {
  intent: Intent;
  skillName: string | null;
  requiresApproval: boolean;
  description: string;
}
