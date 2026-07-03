import type { WakeWordDetector, Transcriber } from "../types";

// Tipos mínimos de la Web Speech API (no están en lib.dom de forma estable).
type SR = typeof window & { webkitSpeechRecognition?: any; SpeechRecognition?: any };

// ¿Este navegador tiene reconocimiento de voz? (Chrome/Edge sí; Firefox no.)
// Si no, los adaptadores degradan a no-op: el panel vive, la voz se apaga.
export const speechRecognitionSupported =
  typeof window !== "undefined" &&
  Boolean((window as SR).SpeechRecognition || (window as SR).webkitSpeechRecognition);

function newRecognition(): any | null {
  const w = window as SR;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    console.warn("Web Speech API no soportada en este navegador: voz desactivada");
    return null;
  }
  const r = new Ctor();
  r.lang = "es-AR";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

// start() tolerante: en dev StrictMode monta dos veces y el segundo start()
// del mismo reconocimiento tira "already started".
function safeStart(rec: any) {
  try {
    rec.start();
  } catch {
    /* ya estaba corriendo */
  }
}

// Wake word: reconocimiento continuo que busca "wattson" en el transcript.
export class WebSpeechWakeWord implements WakeWordDetector {
  private rec: any;
  start(onWake: () => void) {
    this.rec = newRecognition();
    if (!this.rec) return;
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase();
        if (t.includes("wattson")) onWake();
      }
    };
    this.rec.onend = () => { if (this.rec) safeStart(this.rec); }; // reinicia
    safeStart(this.rec);
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}

export class WebSpeechTranscriber implements Transcriber {
  private rec: any;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.rec = newRecognition();
    if (!this.rec) return;
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) onFinal(text);
        else onPartial(text);
      }
    };
    safeStart(this.rec);
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}
