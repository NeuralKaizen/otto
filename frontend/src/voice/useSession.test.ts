import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { FakeWakeWord, FakeTranscriber, FakeSpeaker } from "./adapters/fakes";

function setup() {
  const wake = new FakeWakeWord();
  const stt = new FakeTranscriber();
  const tts = new FakeSpeaker();
  const converse = vi.fn().mockResolvedValue({
    narration: "tres atrasadas",
    widgets: [{ type: "kpi_card", title: "Atrasadas", data: { value: 3 } }],
  });
  const hook = renderHook(() =>
    useSession({ wake, stt, tts, converse, closingPhrase: "listo", silenceMs: 30000 }),
  );
  return { ...hook, wake, stt, tts, converse };
}

describe("useSession", () => {
  it("flujo completo: wake -> hablar -> respuesta -> render + speak", async () => {
    const { result, wake, stt, tts, converse } = setup();
    expect(result.current.state).toBe("idle");

    act(() => wake.trigger());
    expect(result.current.state).toBe("listening");

    act(() => stt.emit("cuántas atrasadas", true));

    await waitFor(() => expect(converse).toHaveBeenCalledWith("cuántas atrasadas"));
    await waitFor(() => expect(result.current.state).toBe("speaking"));
    expect(result.current.widgets[0].data).toEqual({ value: 3 });

    act(() => tts.finish());
    await waitFor(() => expect(result.current.state).toBe("listening"));
  });

  it("frase de cierre cierra la sesión", () => {
    const { result, wake, stt } = setup();
    act(() => wake.trigger());
    act(() => stt.emit("listo", true));
    expect(result.current.state).toBe("idle");
  });
});
