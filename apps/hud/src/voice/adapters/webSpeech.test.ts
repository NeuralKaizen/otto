import { describe, it, expect } from "vitest";
import { isWakeWord } from "./webSpeech";

describe("isWakeWord", () => {
  it.each(["alfred", "Alfred", "alfredo", "hey Alfredo, cómo va", "ALFRED"])(
    "matchea %j",
    (t) => expect(isWakeWord(t)).toBe(true),
  );

  it.each(["whatsapp", "wattson", "hola", "", "al fred"])(
    "NO matchea %j",
    (t) => expect(isWakeWord(t)).toBe(false),
  );
});

import { collectTranscript } from "./webSpeech";

describe("collectTranscript", () => {
  const seg = (t: string, isFinal: boolean) => ({ isFinal, 0: { transcript: t } });
  it("acumula la frase completa en vez de fragmentos sueltos", () => {
    const r = collectTranscript([seg("métricas de ", true), seg("instagram", false)]);
    expect(r).toEqual({ finals: "métricas de", interim: "instagram" });
  });
  it("solo finales → interim vacío", () => {
    const r = collectTranscript([seg("cómo vienen ", true), seg("mis métricas", true)]);
    expect(r).toEqual({ finals: "cómo vienen mis métricas", interim: "" });
  });
});
