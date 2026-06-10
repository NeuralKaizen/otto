import type { WakeWordDetector, Transcriber } from "../types";

// Tipos mínimos de la Web Speech API (no están en lib.dom de forma estable).
type SR = typeof window & { webkitSpeechRecognition?: any; SpeechRecognition?: any };

function newRecognition(): any {
  const w = window as SR;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) throw new Error("Web Speech API no soportada en este navegador");
  const r = new Ctor();
  r.lang = "es-AR";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

// Wake word: reconocimiento continuo que busca "otto" en el transcript.
export class WebSpeechWakeWord implements WakeWordDetector {
  private rec: any;
  start(onWake: () => void) {
    this.rec = newRecognition();
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase();
        if (t.includes("otto")) onWake();
      }
    };
    this.rec.onend = () => { if (this.rec) this.rec.start(); }; // reinicia
    this.rec.start();
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}

export class WebSpeechTranscriber implements Transcriber {
  private rec: any;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.rec = newRecognition();
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) onFinal(text);
        else onPartial(text);
      }
    };
    this.rec.start();
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}
