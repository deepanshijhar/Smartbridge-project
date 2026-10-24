import { afterEach, expect, it, vi } from "vitest";
import { analyzeWithPython, type AnalysisInput } from "./python-analysis";

const input: AnalysisInput = { now: 4000, t: 4, tracks: [], samples: [], db: null, timeline: [] };
afterEach(() => vi.unstubAllGlobals());

it("does not contact Python when unconfigured", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await analyzeWithPython(input, "")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("returns a compatible Python analysis", async () => {
  const result = { point: { t: 4, score: 88, students: 2, db: null }, presentIds: [1, 2], suggestions: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
  expect(await analyzeWithPython(input, "http://127.0.0.1:8000")).toEqual(result);
});
it("preserves browser fallback on connection failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await analyzeWithPython(input, "http://127.0.0.1:8000")).toBeNull();
});
it("rejects invalid scores", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ point: { t: 4, score: 500, students: 2, db: null }, presentIds: [], suggestions: [] }) }));
  expect(await analyzeWithPython(input, "http://127.0.0.1:8000")).toBeNull();
});