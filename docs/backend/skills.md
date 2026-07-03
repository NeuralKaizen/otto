# Skills

## What is a Skill?

A skill is a typed, documented, permission-aware capability that Jarvis can invoke on behalf of the user.
Skills are pure functions: they receive typed args, return typed results, and never have side effects beyond what is declared.

## Skill Interface

```ts
interface SkillDefinition<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: unknown;        // JSON Schema for the args
  requiresApproval: boolean;   // true = user must confirm before execution
  riskLevel: "low" | "medium" | "high";
  permissions: string[];       // e.g. ["memory:write", "calendar:read"]
  execute: (args: TArgs, context: SkillContext) => Promise<TResult>;
}
```

## Registry

```ts
import { getSkill, listSkills } from "@jarvis/skills";

const skill = getSkill("generatePostIdeas");
const all = listSkills();
```

## Built-in Skills

| Skill | Description | Approval |
|-------|-------------|----------|
| `generatePostIdeas` | LinkedIn post ideas from meeting notes | No |
| `saveMemory` | Save fact/project/preference to memory | No |
| `searchMemory` | Search previously saved memories | No |
| `getUpcomingEvents` | Calendar events (mock) | No |
| `getSystemStatus` | API, DB, LLM, voice status | No |

## Creating a New Skill

1. Create a file in `packages/skills/src/<category>/<mySkill>.ts`
2. Export a `SkillDefinition` object
3. Register it in `packages/skills/src/registry.ts`
4. The agent-core will automatically route to it via `INTENT_TO_SKILL` mapping in `agent.ts`

### Example

```ts
import type { SkillDefinition } from "../types.js";

export const mySkill: SkillDefinition<{ message: string }, { result: string }> = {
  name: "mySkill",
  description: "Does something useful",
  inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  requiresApproval: false,
  riskLevel: "low",
  permissions: [],
  async execute(args, _ctx) {
    return { result: `Processed: ${args.message}` };
  },
};
```
