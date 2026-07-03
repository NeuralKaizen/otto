import type { SkillLike } from "./types.js";

export interface PermissionContext {
  source: "web" | "voice" | "cli";
}

// Phase 2: all local permissions granted.
// Phase 3: implement per-source permission matrix and OAuth scopes.
export function checkPermissions(_skill: SkillLike, _ctx: PermissionContext): boolean {
  return true;
}
