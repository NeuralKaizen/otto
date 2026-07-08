import type { LLMProvider, ChatInput, LLMChunk, LLMResponse } from "./types.js";

const TIMEOUT_MS = 30_000;

export function createOpenAIProvider(apiKey: string, model: string, baseURL?: string): LLMProvider {
  // Client is created lazily to avoid import-time errors if the package is missing.
  // The API key is captured in closure — never logged.
  // baseURL lets us point the OpenAI-compatible client at a different gateway
  // (e.g. OpenRouter: https://openrouter.ai/api/v1) without changing the call sites.
  let _client: import("openai").OpenAI | null = null;

  async function getClient(): Promise<import("openai").OpenAI> {
    if (!_client) {
      const { default: OpenAI } = await import("openai");
      _client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, ...(baseURL ? { baseURL } : {}) });
    }
    return _client;
  }

  return {
    name: "openai",

    isAvailable(): boolean {
      return true;
    },

    async *streamChat(input: ChatInput): AsyncIterable<LLMChunk> {
      const client = await getClient();

      const stream = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: true,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.7,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        const done = chunk.choices[0]?.finish_reason != null;
        if (delta) yield { delta, done: false };
        if (done) yield { delta: "", done: true };
      }
    },

    async complete(input: ChatInput): Promise<LLMResponse> {
      const client = await getClient();

      const resp = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: false,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.7,
      });

      const content = resp.choices[0]?.message?.content ?? "";
      const usage = resp.usage
        ? {
            inputTokens: resp.usage.prompt_tokens,
            outputTokens: resp.usage.completion_tokens,
            totalTokens: resp.usage.total_tokens,
          }
        : undefined;

      return { content, model, usage };
    },
  };
}
