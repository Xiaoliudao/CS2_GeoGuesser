// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState, PublicPlayer } from "../../shared/types";
import { GameResult } from "./GameResult";

afterEach(cleanup);

function player(slotIndex: number, score: number, active = true): PublicPlayer {
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

function finishedRoom(scores: number[]): GameRoomState {
  return {
    roomCode: "ABCDE",
    status: "finished",
    settings: { ...DEFAULT_ROOM_SETTINGS, mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool] },
    hostPlayerId: "player-0",
    maxPlayers: 5,
    players: scores.map((score, slotIndex) => player(slotIndex, score, slotIndex !== 4)),
    round: 5,
    questionCount: 20,
    currentQuestion: null,
    nextQuestion: null,
    prepareDeadline: null,
    assetPrepareAttempt: 0,
    roundStartedAt: null,
    roundEndsAt: null,
    roundResult: null,
    assetOrigin: "",
    failureCode: null,
    stateVersion: 20,
    serverNow: 30_000,
  };
}

describe("GameResult multiplayer ranking", () => {
  it("declares the viewer the unique winner among five players", () => {
    render(<GameResult room={finishedRoom([120, 180, 310, 250, 90])} playerId="player-2" onPlayAgain={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByText("VICTORY")).toBeTruthy();
    expect(screen.getAllByText("Player 3")).toHaveLength(2);
    expect(document.querySelectorAll(".final-scores > .winner")).toHaveLength(1);
    expect(document.querySelector(".final-scores > .winner .final-player-seat")?.textContent).toBe("P3");
  });

  it("highlights every winner in a three-way tie and gives them the same rank", () => {
    render(<GameResult room={finishedRoom([300, 300, 300, 200, 100])} playerId="player-1" onPlayAgain={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByText("3-WAY DRAW")).toBeTruthy();
    expect(screen.getByText("Player 1 · Player 2 · Player 3")).toBeTruthy();
    expect(screen.getByText("YOU SHARE THE WIN")).toBeTruthy();
    expect(document.querySelectorAll(".final-scores > .winner")).toHaveLength(3);
    expect(screen.getAllByText("#1")).toHaveLength(3);
    expect(screen.getByText("DNF")).toBeTruthy();
  });
});
