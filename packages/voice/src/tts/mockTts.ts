import type { TTSProvider, TTSResult } from "../types.js";

export const mockTts: TTSProvider = {
  name: "mock",
  async synthesize(_text: string): Promise<TTSResult> {
    return { provider: "mock", audioUrl: undefined, message: "TTS mock active — configure ELEVENLABS_API_KEY to enable real voice" };
  },
};
