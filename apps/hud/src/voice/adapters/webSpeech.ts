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

// Wake word: el reconocimiento es-AR entiende "Alfred" o "Alfredo"
// ("wattson" lo transcribía como "whatsapp", por eso el cambio de nombre).
export function isWakeWord(transcript: string): boolean {
  return transcript.toLowerCase().includes("alfred");
}

// Wake word: reconocimiento continuo que busca la palabra de activación.
export class WebSpeechWakeWord implements WakeWordDetector {
  private rec: any;
  start(onWake: () => void) {
    this.rec = newRecognition();
    if (!this.rec) return;
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (isWakeWord(e.results[i][0].transcript)) onWake();
      }
    };
    this.rec.onerror = (e: any) => console.warn("[wake] error:", e?.error, e?.message ?? "");
    this.rec.onend = () => { if (this.rec) safeStart(this.rec); }; // reinicia
    safeStart(this.rec);
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}

// Acumula TODOS los resultados del reconocimiento en una sola frase.
// Emitir cada segmento suelto hacía que el subtítulo saltara entre
// fragmentos ("Instagram" → "metricas de") en vez de crecer.
export function collectTranscript(results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>): {
  finals: string;
  interim: string;
} {
  let finals = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.isFinal) finals += r[0].transcript;
    else interim += r[0].transcript;
  }
  return { finals: finals.trim(), interim: interim.trim() };
}

export class WebSpeechTranscriber implements Transcriber {
  private rec: any;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.rec = newRecognition();
    if (!this.rec) return;
    this.rec.onresult = (e: any) => {
      const { finals, interim } = collectTranscript(e.results);
      if (interim) onPartial([finals, interim].filter(Boolean).join(" "));
      else if (finals) onFinal(finals);
    };
    safeStart(this.rec);
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}
