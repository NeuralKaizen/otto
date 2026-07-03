import type { WakeWordDetector, Transcriber, Speaker } from "../types";

export class FakeWakeWord implements WakeWordDetector {
  private onWake?: () => void;
  start(onWake: () => void) { this.onWake = onWake; }
  stop() { this.onWake = undefined; }
  trigger() { this.onWake?.(); }
}

export class FakeTranscriber implements Transcriber {
  private onPartial?: (t: string) => void;
  private onFinal?: (t: string) => void;
  start(onPartial: (t: string) => void, onFinal: (t: string) => void) {
    this.onPartial = onPartial;
    this.onFinal = onFinal;
  }
  stop() { this.onPartial = undefined; this.onFinal = undefined; }
  emit(text: string, final: boolean) {
    if (final) this.onFinal?.(text);
    else this.onPartial?.(text);
  }
}

export class FakeSpeaker implements Speaker {
  private onEnd?: () => void;
  speak(_text: string, onEnd: () => void) { this.onEnd = onEnd; }
  stop() { this.onEnd = undefined; }
  finish() { const cb = this.onEnd; this.onEnd = undefined; cb?.(); }
}
