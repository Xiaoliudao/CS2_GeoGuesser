// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    const surface = document.querySelector(".radar-gesture-surface") as HTMLDivElement;
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.load(screen.getByRole("img", { name: /result radar/i }));

    expect(screen.getByRole("img", { name: "Correct answer point" }).closest(".radar-marker-overlay")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Your guessed point" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rival's guessed point" })).toBeTruthy();
    expect(screen.getByText("P2 Opponent")).toBeTruthy();
  });
});
