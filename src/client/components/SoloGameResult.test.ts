import { describe, expect, it } from "vitest";
import type { SoloRoundResult } from "../../shared/solo";
import { summarizeSoloResults } from "./SoloGameResult";

function result(round: number, mapCorrect: boolean, distance: number | null, hintUsed: boolean): SoloRoundResult {
  return {
    round,
    questionId: `q-${round}`,
    correctMapId: "mirage",
    correctLayerId: "main",
    correctPoint: { x: 0.5, y: 0.5 },
    hintUsed,
    player: {
      playerId: "solo",
      nickname: "Tester",
      submitted: true,
      mapGuess: mapCorrect ? "mirage" : "inferno",
      layerGuess: "main",
      pointGuess: { x: 0.5, y: 0.5 },
      mapCorrect,
      layerCorrect: mapCorrect,
      distance,
      mapScore: mapCorrect ? 10 : 0,
      layerScore: mapCorrect ? 5 : 0,
      locationScore: 0,
      timeBonus: 0,
      elapsedMs: 10_000,
      points: mapCorrect ? 15 : 0,
    },
  };
}

describe("solo final summary", () => {
  it("uses only reliable completed result fields", () => {
    const summary = summarizeSoloResults({ results: [
      result(1, true, 0.02, true),
      result(2, false, null, false),
      result(3, true, 0.04, true),
    ] });

    expect(summary.rounds).toBe(3);
    expect(summary.mapsCorrect).toBe(2);
    expect(summary.hintsUsed).toBe(2);
    expect(summary.averageDistance).toBeCloseTo(0.03, 12);
  });

  it("does not fabricate an average when no comparable distances exist", () => {
    expect(summarizeSoloResults({ results: [result(1, false, null, false)] }).averageDistance).toBeNull();
  });
});
