import { describe, expect, it } from "vitest";
import type { Question } from "./questions";
import { DEFAULT_ROOM_SETTINGS, roundDurationMs } from "../../shared/roomSettings";
import {
  LAYER_SCORE,
  MAP_SCORE,
  MAX_LOCATION_DISTANCE,
  MAX_LOCATION_SCORE,
  MAX_ROUND_SCORE,
  MAX_TIME_BONUS,
  calculateTimeBonus,
  distanceBetween,
  normalizeScore,
  scoreGuess,
} from "./scoring";

const DEFAULT_ROUND_DURATION_MS = roundDurationMs(DEFAULT_ROOM_SETTINGS);

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
    expect(scoreGuess(question, "inferno", "main", { x: 0.5, y: 0.5 }, 1_000, 2_000, DEFAULT_ROUND_DURATION_MS)).toEqual({
      mapCorrect: false, layerCorrect: false, distance: null, mapScore: 0, layerScore: 0,
      locationScore: 0, timeBonus: 0, points: 0, elapsedMs: 1_000,
    });
  });

  it("caps an immediate exact answer at 100 weighted points", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 0, DEFAULT_ROUND_DURATION_MS);
    expect({
      mapScore: result.mapScore,
      layerScore: result.layerScore,
      locationScore: result.locationScore,
      timeBonus: result.timeBonus,
      points: result.points,
    }).toEqual({
      mapScore: 10,
      layerScore: 5,
      locationScore: 65,
      timeBonus: 20,
      points: 100,
    });
    expect(result.points).toBe(MAX_ROUND_SCORE);
  });

  it("adds an integer server-timed bonus to an exact location", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 5_000, DEFAULT_ROUND_DURATION_MS);
    expect(result.distance).toBe(0);
    expect(result.mapScore).toBe(MAP_SCORE);
    expect(result.layerScore).toBe(LAYER_SCORE);
    expect(result.locationScore).toBe(MAX_LOCATION_SCORE);
    expect(result.timeBonus).toBe(15);
    expect(result.points).toBe(MAP_SCORE + LAYER_SCORE + MAX_LOCATION_SCORE + 15);
  });

  it("keeps the bounded time bonus when the map and layer are correct", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 1, y: 1 }, 0, 5_000, DEFAULT_ROUND_DURATION_MS);
    expect(result.distance).toBeGreaterThan(MAX_LOCATION_DISTANCE);
    expect(result.locationScore).toBe(0);
    expect(result.timeBonus).toBe(15);
    expect(result.points).toBe(MAP_SCORE + LAYER_SCORE + 15);
  });

  it("uses the configured quadratic accuracy curve", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.675, y: 0.5 }, 0, 5_000, DEFAULT_ROUND_DURATION_MS);
    expect(result.distance).toBeCloseTo(MAX_LOCATION_DISTANCE / 2);
    expect(result.locationScore).toBe(16);
    expect(result.timeBonus).toBe(15);
    expect(result.points).toBe(46);
  });

  it("awards map points but no location or time points for the wrong floor", () => {
    const nukeQuestion = { ...question, correctMapId: "nuke", correctLayerId: "upper" } as const;
    expect(scoreGuess(nukeQuestion, "nuke", "lower", { x: 0.5, y: 0.5 }, 0, 500, DEFAULT_ROUND_DURATION_MS)).toEqual({
      mapCorrect: true, layerCorrect: false, distance: null, mapScore: MAP_SCORE, layerScore: 0,
      locationScore: 0, timeBonus: 0, points: MAP_SCORE, elapsedMs: 500,
    });
  });

  it("gives a faster player more points when map and distance are identical", () => {
    const fast = scoreGuess(question, "mirage", "main", { x: 0.6, y: 0.5 }, 10_000, 12_000, DEFAULT_ROUND_DURATION_MS);
    const slow = scoreGuess(question, "mirage", "main", { x: 0.6, y: 0.5 }, 10_000, 19_000, DEFAULT_ROUND_DURATION_MS);
    expect(fast.locationScore).toBe(slow.locationScore);
    expect(fast.distance).toBe(slow.distance);
    expect(fast.timeBonus).toBeGreaterThan(slow.timeBonus);
    expect(fast.points).toBeGreaterThan(slow.points);
  });

  it("never exposes fractional points for millisecond timing", () => {
    const first = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 1_000, DEFAULT_ROUND_DURATION_MS);
    const second = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 1_001, DEFAULT_ROUND_DURATION_MS);
    expect(Number.isInteger(first.timeBonus)).toBe(true);
    expect(Number.isInteger(second.timeBonus)).toBe(true);
    expect(Number.isInteger(first.points)).toBe(true);
    expect(Number.isInteger(second.points)).toBe(true);
  });

  it("bounds the time bonus from zero through the configured maximum", () => {
    expect(calculateTimeBonus(-1, DEFAULT_ROUND_DURATION_MS)).toBe(MAX_TIME_BONUS);
    expect(calculateTimeBonus(0, DEFAULT_ROUND_DURATION_MS)).toBe(MAX_TIME_BONUS);
    expect(calculateTimeBonus(DEFAULT_ROUND_DURATION_MS / 2, DEFAULT_ROUND_DURATION_MS)).toBe(MAX_TIME_BONUS / 2);
    expect(calculateTimeBonus(DEFAULT_ROUND_DURATION_MS, DEFAULT_ROUND_DURATION_MS)).toBe(0);
    expect(calculateTimeBonus(DEFAULT_ROUND_DURATION_MS + 1, DEFAULT_ROUND_DURATION_MS)).toBe(0);
    expect(calculateTimeBonus(22_500, 45_000)).toBe(MAX_TIME_BONUS / 2);
  });

  it("uses only the shared server deadline and never RTT to alter scoring authority", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 10_000, 20_000, 45_000);
    expect(result.elapsedMs).toBe(10_000);
    expect(result.timeBonus).toBe(calculateTimeBonus(10_000, 45_000));
    expect(scoreGuess.length).toBe(7);
  });

  it("normalizes accumulated scores to non-negative integers", () => {
    expect(normalizeScore(99.5 + 50.5)).toBe(150);
    expect(normalizeScore(0.1 + 0.2)).toBe(0);
    expect(normalizeScore(19.5)).toBe(20);
    expect(normalizeScore(Number.NaN)).toBe(0);
  });

  it("returns integers for every component and total across the whole timer", () => {
    for (let elapsedMs = 0; elapsedMs <= DEFAULT_ROUND_DURATION_MS; elapsedMs += 137) {
      const result = scoreGuess(question, "mirage", "main", { x: 0.6123, y: 0.5 }, 0, elapsedMs, DEFAULT_ROUND_DURATION_MS);
      expect([result.mapScore, result.layerScore, result.locationScore, result.timeBonus, result.points].every(Number.isInteger)).toBe(true);
    }
  });
});
