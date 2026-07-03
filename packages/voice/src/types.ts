export interface TTSProvider {
  name: string;
  synthesize(text: string): Promise<TTSResult>;
}

export interface TTSResult {
  provider: string;
  audioBuffer?: ArrayBuffer;
  audioUrl?: string;
  message?: string;
}

export interface STTProvider {
  name: string;
  transcribe(audio: ArrayBuffer): Promise<string>;
}
