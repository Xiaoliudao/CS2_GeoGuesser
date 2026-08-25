// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState } from "../../shared/types";
import { Lobby } from "./Lobby";

afterEach(cleanup);

function waitingRoom(ready: boolean, questionCount = 10): GameRoomState {
  return {
    roomCode: "ABCDE",
    status: "waiting",
    settings: { ...DEFAULT_ROOM_SETTINGS, totalRounds: 5, mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool] },
    players: [
      { id: "player-a", nickname: "Alpha", connected: true, ready, score: 0, submitted: false, assetReady: false },
      { id: "player-b", nickname: "Bravo", connected: true, ready: false, score: 0, submitted: false, assetReady: false },
    ],
    round: 0,
    questionCount,
    currentQuestion: null,
    nextQuestion: null,
    prepareDeadline: null,
    assetPrepareAttempt: 0,
    roundStartedAt: null,
    roundEndsAt: null,
    roundResult: null,
    assetOrigin: "",
    failureCode: null,
    stateVersion: 1,
    serverNow: Date.now(),
  };
}

describe("Lobby ready toggle", () => {
  it("lets an unready player ready up", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<Lobby room={waitingRoom(false)} playerId="player-a" onReady={onReady} />);

    const button = screen.getByRole("button", { name: "READY UP" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.click(button);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("lets a ready player cancel while the opponent is not ready", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<Lobby room={waitingRoom(true)} playerId="player-a" onReady={onReady} />);

    const button = screen.getByRole("button", { name: "CANCEL READY" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("still allows cancellation if question availability drops", () => {
    render(<Lobby room={waitingRoom(true, 0)} playerId="player-a" onReady={vi.fn()} />);
    expect((screen.getByRole("button", { name: "CANCEL READY" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers an invite action for an open player slot", () => {
    const room = waitingRoom(false);
    room.players = room.players.slice(0, 1);
    render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} />);

    expect(screen.getByText("INVITE A PLAYER TO JOIN")).toBeTruthy();
    expect(screen.getByRole("button", { name: "INVITE PLAYER" })).toBeTruthy();
  });
});
