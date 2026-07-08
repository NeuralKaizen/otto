import type { LLMProvider, ProviderInfo } from "./types.js";
import { mockProvider } from "./mockProvider.js";
import { createOpenAIProvider } from "./openaiProvider.js";
import { createFallbackProvider } from "./fallbackProvider.js";

let activeProvider: LLMProvider | null = null;
let activeProviderInfo: ProviderInfo | null = null;

function readProviderInfo(): ProviderInfo {
  const enableReal = process.env.ENABLE_REAL_LLM !== "false";
  const providerName = process.env.LLM_PROVIDER ?? "mock";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const isReal = enableReal && providerName === "openai" && Boolean(apiKey);

  return {
    active: isReal ? providerName : "mock",
    realLLMEnabled: isReal,
    model: isReal ? model : null,
  };
}

export function createProvider(): LLMProvider {
  if (activeProvider) {
    return activeProvider;
  }

  const enableReal = process.env.ENABLE_REAL_LLM !== "false";
  const providerName = process.env.LLM_PROVIDER ?? "mock";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  // OpenAI-compatible gateway (e.g. OpenRouter). Empty → real OpenAI.
  const baseURL = process.env.OPENAI_BASE_URL || undefined;

  if (enableReal && providerName === "openai" && apiKey) {
    console.log(`[provider] Using OpenAI-compatible provider (${baseURL ?? "api.openai.com"}) with mock fallback`);
    const openaiProvider = createOpenAIProvider(apiKey, model, baseURL);
    activeProvider = createFallbackProvider(openaiProvider, mockProvider);
    activeProviderInfo = {
      active: "openai",
      realLLMEnabled: true,
      model,
    };
    return activeProvider;
  }

  if (providerName === "openai" && !apiKey) {
    console.warn("[provider] LLM_PROVIDER=openai but OPENAI_API_KEY missing - falling back to mock");
  }
  if (!enableReal) {
    console.log("[provider] ENABLE_REAL_LLM=false - using mock");
  } else {
    console.log("[provider] Using mock provider");
  }

  activeProvider = mockProvider;
  activeProviderInfo = readProviderInfo();
  return activeProvider;
}

export function getProviderInfo(): ProviderInfo {
  if (activeProviderInfo) {
    return activeProviderInfo;
  }

  activeProviderInfo = readProviderInfo();
  return activeProviderInfo;
}
