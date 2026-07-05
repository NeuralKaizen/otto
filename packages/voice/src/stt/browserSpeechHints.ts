// Browser SpeechRecognition is handled in the frontend (apps/web).
// This file documents the expected interface for future native STT providers.

export interface BrowserSpeechConfig {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
}

export const defaultBrowserSpeechConfig: BrowserSpeechConfig = {
  lang: "es-MX",
  continuous: false,
  interimResults: true,
};
