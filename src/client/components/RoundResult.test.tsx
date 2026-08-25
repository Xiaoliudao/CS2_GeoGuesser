// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState, PlayerRoundResult, PublicPlayer } from "../../shared/types";
import { RoundResult } from "./RoundResult";

afterEach(cleanup);

function publicPlayer(slotIndex: number, score: number, active = true): PublicPlayer {
  return {
    id: `player-${slotIndex}`,
    nickname: `Player ${slotIndex + 1}`,
    slotIndex,
    active,
    connected: active,
    ready: true,
    score,
    submitted: true,
    assetReady: true,
  };
}

function resultPlayer(slotIndex: number, points: number): PlayerRoundResult {
  return {
    playerId: `player-${slotIndex}`,
    nickname: `Player ${slotIndex + 1}`,
    submitted: true,
    mapGuess: "mirage",
    layerGuess: "main",
    pointGuess: { x: 0.2 + slotIndex * 0.1, y: 0.3 + slotIndex * 0.1 },
    mapCorrect: true,
    layerCorrect: true,
    distance: 0.05 + slotIndex * 0.01,
    mapScore: 10,
    layerScore: 5,
    locationScore: 60,
    timeBonus: 15,
    elapsedMs: 2_000 + slotIndex * 100,
    points,
  };
}

function resultRoom(): GameRoomState {
  const players = [
    publicPlayer(0, 210),
    publicPlayer(1, 250),
    publicPlayer(2, 250),
    publicPlayer(3, 175),
    publicPlayer(4, 90, false),
  ];
  return {
    roomCode: "ABCDE",
    status: "round_result",
    settings: { ...DEFAULT_ROOM_SETTINGS, mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool] },
    hostPlayerId: "player-0",
    maxPlayers: 5,
    players,
    round: 1,
    questionCount: 20,
    currentQuestion: { questionId: "q-1", imageUrl: "/media/questions/q-1" },
    nextQuestion: null,
    prepareDeadline: null,
    assetPrepareAttempt: 0,
    roundStartedAt: 1_000,
    roundEndsAt: 21_000,
    roundResult: {
      correctMapId: "mirage",
      correctLayerId: "main",
      correctPoint: { x: 0.5, y: 0.5 },
      players: [resultPlayer(0, 80), resultPlayer(1, 90), resultPlayer(2, 90), resultPlayer(3, 50), resultPlayer(4, 10)],
      nextRoundAt: 30_000,
    },
    assetOrigin: "",
    failureCode: null,
    stateVersion: 8,
    serverNow: 22_000,
  };
}

describe("RoundResult multiplayer summary", () => {
  it("shows a compact five-player leaderboard, ties, totals, and expandable details", () => {
    render(<RoundResult room={resultRoom()} playerId="player-1" />);

    const leaderboard = screen.getByLabelText("Round leaderboard");
    expect(leaderboard.querySelectorAll(":scope > div")).toHaveLength(5);
    expect(screen.getAllByText("#1")).toHaveLength(2);
    expect(screen.getAllByText("TOTAL 250")).toHaveLength(2);
    expect(screen.getAllByText("P5").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".round-result-details details")).toHaveLength(5);
    expect(document.querySelector(".round-result-details details.is-me")?.hasAttribute("open")).toBe(true);
    expect(document.querySelector(".round-result-leaderboard .is-dnf")).toBeTruthy();
  });
});
