export interface ChatRequest {
  conversationId?: string;
  message: string;
  source: "web" | "voice" | "cli";
}

export interface ChatResponse {
  conversationId: string;
  runId: string;
}

export interface ApiError {
  ok: false;
  error: string;
}

export interface ApiOk<T = unknown> {
  ok: true;
  data: T;
}
