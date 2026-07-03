import type { STTProvider } from "../types.js";

export const mockStt: STTProvider = {
  name: "mock",
  async transcribe(_audio: ArrayBuffer): Promise<string> {
    return "[STT mock — configure a real provider to enable transcription]";
  },
};
