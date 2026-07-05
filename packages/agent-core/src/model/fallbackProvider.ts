import type { LLMProvider, ChatInput, LLMChunk, LLMResponse } from "./types.js";

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Strip any possible token/key that might appear in error messages
    return err.message.replace(/sk-[A-Za-z0-9-_]+/g, "[REDACTED]");
  }
  return String(err);
}

export function createFallbackProvider(primary: LLMProvider, fallback: LLMProvider): LLMProvider {
  return {
    get name() {
      return primary.name;
    },

    isAvailable(): boolean {
      return primary.isAvailable();
    },

    async *streamChat(input: ChatInput): AsyncIterable<LLMChunk> {
      try {
        let yielded = false;
        for await (const chunk of primary.streamChat(input)) {
          yielded = true;
          yield chunk;
        }
        if (!yielded) {
          // Empty response from primary — fall back
          throw new Error("Empty response from primary provider");
        }
      } catch (err) {
        console.warn(`[provider] ${primary.name} stream failed — falling back to mock: ${safeErrorMessage(err)}`);
        yield* fallback.streamChat(input);
      }
    },

    async complete(input: ChatInput): Promise<LLMResponse> {
      try {
        return await primary.complete(input);
      } catch (err) {
        console.warn(`[provider] ${primary.name} complete failed — falling back to mock: ${safeErrorMessage(err)}`);
        return fallback.complete(input);
      }
    },
  };
}
