import { describe, it, expect, vi, afterEach } from "vitest";
import { callConverse } from "./converse";

afterEach(() => vi.restoreAllMocks());

describe("callConverse", () => {
  it("postea el texto y devuelve narration + widgets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        narration: "tres",
        widgets: [{ type: "kpi_card", title: "X", data: { value: 3 } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callConverse("cuántas atrasadas");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/converse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.narration).toBe("tres");
    expect(result.widgets[0].data).toEqual({ value: 3 });
  });
});
