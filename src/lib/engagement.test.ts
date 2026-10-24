import { describe, it, expect } from "vitest";
import { combineScore, attentionFromKeypoints, suggest } from "./engagement";

describe("engagement", () => {
  it("ignores missing audio and re-normalizes weights", () => {
    expect(combineScore({ attention: 80, presence: 100, audio: null })).toBe(88);
  });
  it("returns null when no signals", () => {
    expect(combineScore({ attention: null, presence: null, audio: null })).toBeNull();
  });
  it("frontal face gets full attention", () => {
    expect(attentionFromKeypoints({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.5, y: 0.6 })).toBe(100);
  });
  it("suggests a poll when engagement is low", () => {
    const tl = [1, 2, 3, 4].map((t) => ({ t, score: 30, students: 2, db: -40 }));
    expect(suggest(tl).some((s) => s.text.includes("poll"))).toBe(true);
  });
});
