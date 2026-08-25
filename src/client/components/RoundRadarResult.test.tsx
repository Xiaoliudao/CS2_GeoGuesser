// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RoundResultState } from "../../shared/types";
import { RoundRadarResult } from "./RoundRadarResult";

afterEach(cleanup);

describe("RoundRadarResult multiplayer adapter", () => {
  it("renders stable seat markers and a dynamic legend for every visible player", () => {
    const result: RoundResultState = {
      correctMapId: "mirage",
      correctLayerId: "main",
      correctPoint: { x: 0.5, y: 0.5 },
      nextRoundAt: 100,
      players: [
        { playerId: "me", nickname: "Me", submitted: true, mapGuess: "mirage", layerGuess: "main", pointGuess: { x: 0.412345, y: 0.423456 }, mapCorrect: true, layerCorrect: true, distance: 0.1, mapScore: 10, layerScore: 5, locationScore: 20, timeBonus: 5, elapsedMs: 1_000, points: 40 },
        { playerId: "them", nickname: "Rival", submitted: true, mapGuess: "mirage", layerGuess: "main", pointGuess: { x: 0.623456, y: 0.634567 }, mapCorrect: true, layerCorrect: true, distance: 0.1, mapScore: 10, layerScore: 5, locationScore: 20, timeBonus: 4, elapsedMs: 1_100, points: 39 },
      ],
    };
    const players = [
      { id: "me", nickname: "Me", slotIndex: 4, active: true, connected: true, ready: true, score: 40, submitted: true, assetReady: true },
      { id: "them", nickname: "Rival", slotIndex: 1, active: true, connected: true, ready: true, score: 39, submitted: true, assetReady: true },
    ];

    render(<RoundRadarResult result={result} playerId="me" players={players} />);
    const surface = document.querySelector(".radar-gesture-surface") as HTMLDivElement;
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.load(screen.getByRole("img", { name: /result radar/i }));

    expect(screen.getByRole("img", { name: "Correct answer point" }).closest(".radar-marker-overlay")).toBeTruthy();
    const mine = screen.getByRole("img", { name: "P5 your guessed point" });
    const rival = screen.getByRole("img", { name: "P2 Rival's guessed point" });
    expect(mine.classList.contains("player-slot-5")).toBe(true);
    expect(rival.classList.contains("player-slot-2")).toBe(true);
    expect(screen.getByText("P5 Me · YOU")).toBeTruthy();
    expect(screen.getByText("P2 Rival")).toBeTruthy();
    expect(mine.style.left).not.toBe("41%");
  });
});
