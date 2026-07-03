import type { TTSProvider, TTSResult } from "../types.js";

export function createElevenLabsTts(apiKey: string, voiceId: string): TTSProvider {
  return {
    name: "elevenlabs",
    async synthesize(text: string): Promise<TTSResult> {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5", // español + ~75ms + 0.5 créditos/carácter
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs TTS failed: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      return { provider: "elevenlabs", audioBuffer };
    },
  };
}

export async function synthesizeWithElevenLabs(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const provider = createElevenLabsTts(apiKey, voiceId);
  const result = await provider.synthesize(text);
  if (!result.audioBuffer) throw new Error("No audio returned from ElevenLabs");
  return result.audioBuffer;
}
