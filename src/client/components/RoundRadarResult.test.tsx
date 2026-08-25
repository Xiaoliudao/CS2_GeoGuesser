// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RoundResultState } from "../../shared/types";
import { RoundRadarResult } from "./RoundRadarResult";

afterEach(cleanup);

describe("RoundRadarResult multiplayer adapter", () => {
  it("retains both multiplayer markers and the opponent legend", () => {
    const result: RoundResultState = {
      correctMapId: "mirage",
      correctLayerId: "main",
      correctPoint: { x: 0.5, y: 0.5 },
      nextRoundAt: 100,
      players: [
        { playerId: "me", nickname: "Me", submitted: true, mapGuess: "mirage", layerGuess: "main", pointGuess: { x: 0.4, y: 0.4 }, mapCorrect: true, layerCorrect: true, distance: 0.1, mapScore: 10, layerScore: 5, locationScore: 20, timeBonus: 5, elapsedMs: 1_000, points: 40 },
        { playerId: "them", nickname: "Rival", submitted: true, mapGuess: "mirage", layerGuess: "main", pointGuess: { x: 0.6, y: 0.6 }, mapCorrect: true, layerCorrect: true, distance: 0.1, mapScore: 10, layerScore: 5, locationScore: 20, timeBonus: 4, elapsedMs: 1_100, points: 39 },
      ],
    };

    render(<RoundRadarResult result={result} playerId="me" />);

    expect(screen.getByRole("img", { name: "Your guessed point" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rival's guessed point" })).toBeTruthy();
    expect(screen.getByText("P2 Opponent")).toBeTruthy();
  });
});
