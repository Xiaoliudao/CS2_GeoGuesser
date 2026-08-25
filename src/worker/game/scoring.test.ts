import { describe, expect, it } from "vitest";
import type { Question } from "./questions";
import {
  MAP_SCORE,
  MAX_LOCATION_DISTANCE,
  MAX_LOCATION_SCORE,
  MAX_TIME_BONUS,
  ROUND_DURATION_MS,
  calculateTimeBonus,
  distanceBetween,
  scoreGuess,
} from "./scoring";

const question: Question = {
  id: "test",
  imageAssetKey: "questions/test-asset-id.webp",
  correctMapId: "mirage",
  correctLayerId: "main",
  correctPoint: { x: 0.5, y: 0.5 },
  automaticPoint: { x: 0.5, y: 0.5 },
  worldPosition: { x: 0, y: 0, z: 0 },
  coordinateSource: "world-conversion",
};

describe("coordinate scoring", () => {
  it("calculates normalized Euclidean distance", () => {
    expect(distanceBetween({ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 })).toBeCloseTo(0.5);
  });

  it("gives a wrong map zero points regardless of point", () => {
    expect(scoreGuess(question, "inferno", "main", { x: 0.5, y: 0.5 }, 1_000, 2_000)).toEqual({
      mapCorrect: false, distance: null, locationScore: 0, timeBonus: 0, points: 0, elapsedMs: 1_000,
    });
  });

  it("adds a server-timed bonus to an exact location", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 500);
    expect(result.distance).toBe(0);
    expect(result.locationScore).toBe(MAX_LOCATION_SCORE);
    expect(result.timeBonus).toBe(97.5);
    expect(result.points).toBe(MAP_SCORE + MAX_LOCATION_SCORE + 97.5);
  });

  it("keeps the bounded time bonus when the map and layer are correct", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 1, y: 1 }, 0, 500);
    expect(result.distance).toBeGreaterThan(MAX_LOCATION_DISTANCE);
    expect(result.locationScore).toBe(0);
    expect(result.timeBonus).toBe(97.5);
    expect(result.points).toBe(MAP_SCORE + 97.5);
  });

  it("uses the configured quadratic accuracy curve", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.675, y: 0.5 }, 0, 500);
    expect(result.distance).toBeCloseTo(MAX_LOCATION_DISTANCE / 2);
    expect(result.locationScore).toBe(200);
    expect(result.timeBonus).toBe(97.5);
    expect(result.points).toBe(497.5);
  });

  it("awards map points but no location or time points for the wrong floor", () => {
    const nukeQuestion = { ...question, correctMapId: "nuke", correctLayerId: "upper" } as const;
    expect(scoreGuess(nukeQuestion, "nuke", "lower", { x: 0.5, y: 0.5 }, 0, 500)).toEqual({
      mapCorrect: true, distance: null, locationScore: 0, timeBonus: 0, points: MAP_SCORE, elapsedMs: 500,
    });
  });

  it("gives a faster player more points when map and distance are identical", () => {
    const fast = scoreGuess(question, "mirage", "main", { x: 0.6, y: 0.5 }, 10_000, 12_000);
    const slow = scoreGuess(question, "mirage", "main", { x: 0.6, y: 0.5 }, 10_000, 19_000);
    expect(fast.locationScore).toBe(slow.locationScore);
    expect(fast.distance).toBe(slow.distance);
    expect(fast.timeBonus).toBeGreaterThan(slow.timeBonus);
    expect(fast.points).toBeGreaterThan(slow.points);
  });

  it("uses millisecond server timing to break otherwise identical scores", () => {
    const first = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 1_000);
    const second = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 1_001);
    expect(first.timeBonus - second.timeBonus).toBeCloseTo(MAX_TIME_BONUS / ROUND_DURATION_MS, 10);
    expect(first.points).toBeGreaterThan(second.points);
  });

  it("bounds the time bonus from zero through the configured maximum", () => {
    expect(calculateTimeBonus(-1)).toBe(MAX_TIME_BONUS);
    expect(calculateTimeBonus(0)).toBe(MAX_TIME_BONUS);
    expect(calculateTimeBonus(ROUND_DURATION_MS / 2)).toBe(MAX_TIME_BONUS / 2);
    expect(calculateTimeBonus(ROUND_DURATION_MS)).toBe(0);
    expect(calculateTimeBonus(ROUND_DURATION_MS + 1)).toBe(0);
  });
});
