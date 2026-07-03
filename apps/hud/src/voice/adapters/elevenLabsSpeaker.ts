import type { Speaker } from "../types";
import { SpeechSynthesisSpeaker } from "./speechSynthesis";

const DEFAULT_API_URL = "http://localhost:4000";

export interface ElevenLabsSpeakerOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  createAudio?: (src: string) => HTMLAudioElement;
  fallback?: Speaker;
}

// Sesión de un speak(): flags para que onEnd se dispare exactamente una vez
// y para que stop() cancele sin onEnd fantasma.
interface SpeakSession {
  cancelled: boolean;
  done: boolean;
  degraded: boolean;
}

// Voz del agente vía backend (POST /voice/tts → MP3). Ante cualquier fallo
// (red, créditos, provider mock, autoplay) degrada a la voz del browser:
// el agente nunca queda mudo y el FSM nunca queda colgado en "speaking".
export class ElevenLabsSpeaker implements Speaker {
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createAudio: (src: string) => HTMLAudioElement;
  private readonly fallback: Speaker;
  private audio: HTMLAudioElement | null = null;
  private blobUrl: string | null = null;
  private session: SpeakSession | null = null;

  constructor(options: ElevenLabsSpeakerOptions = {}) {
    this.apiUrl = options.apiUrl ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.createAudio = options.createAudio ?? ((src) => new Audio(src));
    this.fallback = options.fallback ?? new SpeechSynthesisSpeaker();
  }

  speak(text: string, onEnd: () => void): void {
    this.stop(); // si había algo sonando, lo corta (sesión anterior cancelada)
    const session: SpeakSession = { cancelled: false, done: false, degraded: false };
    this.session = session;

    const finish = () => {
      if (session.done || session.cancelled) return;
      session.done = true;
      this.cleanup();
      onEnd();
    };

    const degrade = (reason: unknown) => {
      if (session.cancelled || session.done || session.degraded) return;
      session.degraded = true;
      console.warn("[tts] ElevenLabs falló, degrado a voz del navegador:", reason);
      this.cleanup();
      try {
        this.fallback.speak(text, finish);
      } catch {
        finish(); // el fallback también falló: destrabar el FSM igual
      }
    };

    this.fetchImpl(`${this.apiUrl}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("audio")) throw new Error(`respuesta no-audio (${ct || "sin content-type"})`);
        return r.blob();
      })
      .then((blob) => {
        if (session.cancelled) return;
        this.blobUrl = URL.createObjectURL(blob);
        this.audio = this.createAudio(this.blobUrl);
        this.audio.onended = finish;
        this.audio.onerror = () => degrade(new Error("error de reproducción"));
        return this.audio.play();
      })
      .then(undefined, degrade);
  }

  stop(): void {
    // idempotente: seguro aunque no haya nada sonando
    if (this.session) this.session.cancelled = true;
    this.cleanup();
    this.fallback.stop();
  }

  private cleanup(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
