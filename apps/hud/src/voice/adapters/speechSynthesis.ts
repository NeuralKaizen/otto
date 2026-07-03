import type { Speaker } from "../types";

export class SpeechSynthesisSpeaker implements Speaker {
  speak(text: string, onEnd: () => void) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onEnd();
    };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-AR";
    u.onend = finish;
    u.onerror = finish; // si cancel() lo interrumpe, igual destrabamos el FSM
    window.speechSynthesis.speak(u);
  }
  stop() {
    // idempotente: cancel() es seguro aunque no haya nada hablando
    window.speechSynthesis.cancel();
  }
}
