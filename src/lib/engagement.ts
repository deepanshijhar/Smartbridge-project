// Transparent, rule-based engagement scoring. All weights are visible here.

export const WEIGHTS = { attention: 0.5, presence: 0.3, audio: 0.2 } as const;

/** Attention 0-100 from how frontal a face is (nose offset vs. eye midpoint, normalized by eye distance). */
export function attentionFromKeypoints(
  rightEye: { x: number; y: number },
  leftEye: { x: number; y: number },
  nose: { x: number; y: number },
): number {
  const midX = (rightEye.x + leftEye.x) / 2;
  const eyeDist = Math.abs(leftEye.x - rightEye.x) || 1e-6;
  const offset = Math.abs(nose.x - midX) / eyeDist; // 0 = looking straight
  return clamp(Math.round(100 - offset * 160), 0, 100);
}

/** Audio score 0-100: quiet-but-active classrooms score best; silence or loud chaos score lower. */
export function audioScore(db: number | null): number | null {
  if (db === null || !Number.isFinite(db)) return null;
  if (db < -60) return 55; // near silence
  if (db < -45) return 85; // calm, focused
  if (db < -30) return 100; // active discussion
  if (db < -18) return 60; // getting loud
  return 30; // chaotic
}

export function classifyAudio(db: number | null): string {
  if (db === null) return "no_audio";
  if (db < -60) return "silent";
  if (db < -45) return "quiet_focus";
  if (db < -30) return "normal_discussion";
  if (db < -18) return "loud";
  return "chaotic";
}

/**
 * Combine signals. Missing signals are dropped and remaining weights re-normalized,
 * so missing audio never drags the score to zero.
 */
export function combineScore(parts: {
  attention: number | null;
  presence: number | null;
  audio: number | null;
}): number | null {
  let total = 0;
  let weight = 0;
  (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach((k) => {
    const v = parts[k];
    if (v !== null && Number.isFinite(v)) {
      total += v * WEIGHTS[k];
      weight += WEIGHTS[k];
    }
  });
  if (weight === 0) return null;
  return Math.round(total / weight);
}

export type Suggestion = { priority: "high" | "medium" | "low"; text: string; impact: string };

export type TimelinePoint = { t: number; score: number | null; students: number; db: number | null };

/** Rule-based teaching suggestions from the recent engagement trend. */
export function suggest(timeline: TimelinePoint[]): Suggestion[] {
  const scored = timeline.filter((p) => p.score !== null) as (TimelinePoint & { score: number })[];
  if (scored.length < 3) return [];
  const recent = scored.slice(-10);
  const avg = recent.reduce((s, p) => s + p.score, 0) / recent.length;
  const first = recent[0]!.score;
  const last = recent[recent.length - 1]!.score;
  const out: Suggestion[] = [];
  const dbs = recent.map((p) => p.db).filter((d): d is number => d !== null);
  const avgDb = dbs.length ? dbs.reduce((a, b) => a + b, 0) / dbs.length : null;

  if (avg < 50) out.push({ priority: "high", text: "Engagement is low — try a quick interactive poll", impact: "Re-engagement" });
  if (first - last >= 15) out.push({ priority: "high", text: "Attention is dropping — take a 2-minute break", impact: "Focus recovery" });
  if (avgDb !== null && avgDb > -18) out.push({ priority: "medium", text: "Room is very loud — refocus with a clear task", impact: "Classroom control" });
  if (avgDb !== null && avgDb < -60 && avg < 70) out.push({ priority: "medium", text: "Class is silent — ask an open question", impact: "Participation" });
  if (avg >= 80) out.push({ priority: "low", text: "Engagement is high — challenge with a harder problem", impact: "Deep learning" });
  return out;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
