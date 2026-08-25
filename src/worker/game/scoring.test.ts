import { describe, expect, it } from "vitest";
import type { Question } from "./questions";
import { MAP_SCORE, MAX_LOCATION_DISTANCE, MAX_LOCATION_SCORE, distanceBetween, scoreGuess } from "./scoring";

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
      mapCorrect: false, distance: null, locationScore: 0, points: 0, elapsedMs: 1_000,
    });
  });

  it("gives an exact location the maximum 1000 points", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.5, y: 0.5 }, 0, 500);
    expect(result.distance).toBe(0);
    expect(result.locationScore).toBe(MAX_LOCATION_SCORE);
    expect(result.points).toBe(MAP_SCORE + MAX_LOCATION_SCORE);
  });

  it("gives a far location only the map score", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 1, y: 1 }, 0, 500);
    expect(result.distance).toBeGreaterThan(MAX_LOCATION_DISTANCE);
    expect(result.locationScore).toBe(0);
    expect(result.points).toBe(MAP_SCORE);
  });

  it("uses the configured quadratic accuracy curve", () => {
    const result = scoreGuess(question, "mirage", "main", { x: 0.675, y: 0.5 }, 0, 500);
    expect(result.distance).toBeCloseTo(MAX_LOCATION_DISTANCE / 2);
    expect(result.locationScore).toBe(200);
    expect(result.points).toBe(400);
  });

  it("awards map points but no location points for the wrong floor", () => {
    const nukeQuestion = { ...question, correctMapId: "nuke", correctLayerId: "upper" } as const;
    expect(scoreGuess(nukeQuestion, "nuke", "lower", { x: 0.5, y: 0.5 }, 0, 500)).toEqual({
      mapCorrect: true, distance: null, locationScore: 0, points: MAP_SCORE, elapsedMs: 500,
    });
  });
});
