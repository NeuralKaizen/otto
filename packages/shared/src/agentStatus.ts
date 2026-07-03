export type AgentStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "planning"
  | "executing_tool"
  | "waiting_approval"
  | "responding"
  | "done"
  | "error";
