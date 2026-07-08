import type { SkillDefinition } from "./types.js";
import { generatePostIdeas } from "./linkedin/generatePostIdeas.js";
import { saveMemorySkill } from "./memory/saveMemory.js";
import { searchMemorySkill } from "./memory/searchMemory.js";
import { getSystemStatus } from "./system/getSystemStatus.js";
import { socialMetricsSkill } from "./social/socialMetricsSkill.js";
import { notionProjectSkill } from "./notion/notionProjectSkill.js";
import { notionWorkspaceSkill } from "./notion/notionWorkspaceSkill.js";
import { composioSkill } from "./composio/composioSkill.js";

const skills: SkillDefinition[] = [
  generatePostIdeas as SkillDefinition,
  saveMemorySkill as SkillDefinition,
  searchMemorySkill as SkillDefinition,
  getSystemStatus as SkillDefinition,
  socialMetricsSkill as SkillDefinition,
  notionWorkspaceSkill as SkillDefinition,
  notionProjectSkill as SkillDefinition,
  composioSkill as SkillDefinition,
];

const skillMap = new Map<string, SkillDefinition>(skills.map((s) => [s.name, s]));

export function getSkill(name: string): SkillDefinition | undefined {
  return skillMap.get(name);
}

export function listSkills(): SkillDefinition[] {
  return skills;
}
