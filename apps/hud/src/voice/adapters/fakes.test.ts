import { describe, it, expect, vi } from "vitest";
import { FakeWakeWord, FakeTranscriber, FakeSpeaker } from "./fakes";

describe("fake adapters", () => {
  it("FakeWakeWord dispara onWake cuando se invoca trigger()", () => {
    const w = new FakeWakeWord();
    const onWake = vi.fn();
    w.start(onWake);
    w.trigger();
    expect(onWake).toHaveBeenCalledOnce();
  });

  it("FakeTranscriber emite parcial y final", () => {
    const t = new FakeTranscriber();
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    t.start(onPartial, onFinal);
    t.emit("hola", false);
    t.emit("hola wattson", true);
    expect(onPartial).toHaveBeenCalledWith("hola");
    expect(onFinal).toHaveBeenCalledWith("hola wattson");
  });

  it("FakeSpeaker llama onEnd cuando se invoca finish()", () => {
    const s = new FakeSpeaker();
    const onEnd = vi.fn();
    s.speak("tres atrasadas", onEnd);
    s.finish();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
