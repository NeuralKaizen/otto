export interface ChatInputMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatInput {
  messages: ChatInputMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMChunk {
  delta: string;
  done: boolean;
}

export interface LLMUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LLMResponse {
  content: string;
  model?: string;
  usage?: LLMUsage;
}

export interface LLMProvider {
  name: string;
  isAvailable(): boolean;
  streamChat(input: ChatInput): AsyncIterable<LLMChunk>;
  complete(input: ChatInput): Promise<LLMResponse>;
}

export interface ProviderInfo {
  active: string;
  realLLMEnabled: boolean;
  model: string | null;
}
