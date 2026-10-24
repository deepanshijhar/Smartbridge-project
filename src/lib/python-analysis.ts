import { z } from "zod";
import type { TimelinePoint } from "./engagement";

const pointSchema = z.object({
  t: z.number().int().nonnegative(), score: z.number().min(0).max(100).nullable(),
  students: z.number().int().nonnegative(), db: z.number().finite().nullable(),
});
const resultSchema = z.object({
  point: pointSchema,
  presentIds: z.array(z.number().int().positive()),
  suggestions: z.array(z.object({ priority: z.enum(["high", "medium", "low"]), text: z.string(), impact: z.string() })),
});

export type AnalysisInput = {
  now: number; t: number;
  tracks: { id: number; firstSeen: number; lastSeen: number; attention: number; present: boolean }[];
  samples: number[]; db: number | null; timeline: TimelinePoint[];
};

/** Opt-in local Python; unconfigured, invalid, or unavailable services preserve browser behavior. */
export async function analyzeWithPython(input: AnalysisInput, url = import.meta.env['VITE_PYTHON_ANALYSIS_URL']) {
  if (!url) return null;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/analyze`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-EduSense-Client": "local-analysis" },
      body: JSON.stringify(input), signal: AbortSignal.timeout(1500), credentials: "omit",
    });
    if (!response.ok) return null;
    const result = resultSchema.parse(await response.json());
    return result.point.t === input.t ? result : null;
  } catch {
    return null;
  }
}