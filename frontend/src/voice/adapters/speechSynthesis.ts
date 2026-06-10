import type { Speaker } from "../types";

export class SpeechSynthesisSpeaker implements Speaker {
  speak(text: string, onEnd: () => void) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-AR";
    u.onend = () => onEnd();
    window.speechSynthesis.speak(u);
  }
  stop() {
    // idempotente: cancel() es seguro aunque no haya nada hablando
    window.speechSynthesis.cancel();
  }
}
