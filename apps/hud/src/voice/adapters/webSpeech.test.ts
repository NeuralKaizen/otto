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
