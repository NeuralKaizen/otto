export * from "./types.js";
export * from "./tts/mockTts.js";
export * from "./tts/elevenlabsTts.js";
export * from "./stt/mockStt.js";
export * from "./stt/browserSpeechHints.js";

import type { TTSProvider } from "./types.js";
import { mockTts } from "./tts/mockTts.js";
import { createElevenLabsTts } from "./tts/elevenlabsTts.js";

export function createTTSProvider(): TTSProvider {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const provider = process.env.VOICE_PROVIDER ?? "mock";

  if (provider === "elevenlabs" && apiKey) {
    console.log("[voice] Using ElevenLabs TTS");
    return createElevenLabsTts(apiKey, voiceId);
  }

  if (provider === "elevenlabs" && !apiKey) {
    console.warn("[voice] VOICE_PROVIDER=elevenlabs but ELEVENLABS_API_KEY missing — falling back to mock");
  }

  return mockTts;
}
