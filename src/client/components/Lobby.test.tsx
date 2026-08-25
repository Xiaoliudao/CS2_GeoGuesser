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
    hostPlayerId: "player-a",
    maxPlayers: 5,
    players: [
      { id: "player-a", nickname: "Alpha", slotIndex: 0, active: true, connected: true, ready, score: 0, submitted: false, assetReady: false },
      { id: "player-b", nickname: "Bravo", slotIndex: 1, active: true, connected: true, ready: false, score: 0, submitted: false, assetReady: false },
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
    render(<Lobby room={waitingRoom(false)} playerId="player-a" onReady={onReady} onStart={vi.fn()} />);

    const button = screen.getByRole("button", { name: "READY UP" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.click(button);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("lets a ready player cancel while another player is not ready", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<Lobby room={waitingRoom(true)} playerId="player-a" onReady={onReady} onStart={vi.fn()} />);

    const button = screen.getByRole("button", { name: "CANCEL READY" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("still allows cancellation if question availability drops", () => {
    render(<Lobby room={waitingRoom(true, 0)} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} />);
    expect((screen.getByRole("button", { name: "CANCEL READY" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers an invite action for an open player slot", () => {
    const room = waitingRoom(false);
    room.players = room.players.slice(0, 1);
    render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByText("4 OPEN SLOTS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "INVITE PLAYER" })).toBeTruthy();
  });

  it("renders five stable slots and hides invites when the room is full", () => {
    const room = waitingRoom(true);
    room.players = Array.from({ length: 5 }, (_, slotIndex) => ({
      id: `player-${slotIndex}`,
      nickname: `Player ${slotIndex + 1}`,
      slotIndex,
      active: true,
      connected: true,
      ready: true,
      score: 0,
      submitted: false,
      assetReady: false,
    }));
    room.hostPlayerId = "player-0";
    render(<Lobby room={room} playerId="player-0" onReady={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByText("P5")).toBeTruthy();
    expect(screen.getAllByText("READY ✓")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "INVITE PLAYER" })).toBeNull();
  });

  it("lets only the host start once every active player is ready", async () => {
    const user = userEvent.setup();
    const room = waitingRoom(true);
    room.players[1].ready = true;
    const onStart = vi.fn();
    const { rerender } = render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={onStart} />);

    const start = screen.getByRole("button", { name: "START MATCH" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    await user.click(start);
    expect(onStart).toHaveBeenCalledOnce();

    rerender(<Lobby room={room} playerId="player-b" onReady={vi.fn()} onStart={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "START MATCH" })).toBeNull();
    expect(screen.getByText(/WAITING FOR THE HOST TO START/)).toBeTruthy();
  });

  it("keeps start disabled until at least two connected active players are ready", () => {
    const room = waitingRoom(true);
    room.players[1].active = false;
    render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} />);

    expect((screen.getByRole("button", { name: "START MATCH" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/AT LEAST ONE MORE PLAYER/)).toBeTruthy();
  });
});
