// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState, PublicPlayer } from "../../shared/types";
import { useGameSocket } from "../hooks/useGameSocket";
import { useRoundPreparation } from "../hooks/useRoundPreparation";
import { RoomPage } from "./RoomPage";

vi.mock("../hooks/useGameSocket", () => ({ useGameSocket: vi.fn() }));
vi.mock("../hooks/useRoundPreparation", () => ({ useRoundPreparation: vi.fn() }));

function player(slotIndex: number): PublicPlayer {
  return {
    id: `player-${slotIndex}`,
    nickname: `Player ${slotIndex + 1}`,
    slotIndex,
    active: true,
    connected: true,
    ready: true,
    score: 0,
    submitted: false,
    assetReady: false,
  };
}

function waitingRoom(playerCount = 2): GameRoomState {
  return {
    roomCode: "ABCDE",
    status: "waiting",
    settings: { ...DEFAULT_ROOM_SETTINGS, mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool] },
    hostPlayerId: "player-0",
    maxPlayers: 5,
    players: Array.from({ length: playerCount }, (_, slotIndex) => player(slotIndex)),
    round: 0,
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
    stateVersion: 1,
    serverNow: 1_000,
  };
}

const send = vi.fn(() => true);

function mockSocket(room: GameRoomState) {
  vi.mocked(useGameSocket).mockReturnValue({
    room,
    connection: "connected",
    rttMs: 20,
    serverClockOffsetMs: 0,
    clockSynchronized: true,
    error: null,
    clearError: vi.fn(),
    send,
  });
  vi.mocked(useRoundPreparation).mockReturnValue({
    loadState: "idle",
    errorReason: null,
    retry: vi.fn(),
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("cs2-guesser-player-id", "player-0");
  localStorage.setItem("cs2-guesser-nickname", "Player 1");
  send.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoomPage multiplayer lobby wiring", () => {
  it("sends the explicit game:start event when the host starts", async () => {
    mockSocket(waitingRoom(2));
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getByRole("button", { name: "START MATCH" }));
    expect(send).toHaveBeenCalledWith({ type: "game:start" });
  });

  it("hides every invite action once all five slots are occupied", () => {
    mockSocket(waitingRoom(5));
    render(<RoomPage roomCode="ABCDE" />);

    expect(screen.queryByRole("button", { name: /INVITE|SHARE INVITE|COPY INVITE/ })).toBeNull();
  });

  it("keeps an inactive returning player read-only while the match is in progress", () => {
    const room = waitingRoom(3);
    room.status = "playing";
    room.round = 2;
    room.players[0].active = false;
    room.currentQuestion = { questionId: "q-2", imageUrl: "/media/questions/q-2" };
    room.roundStartedAt = 1_000;
    room.roundEndsAt = 21_000;
    mockSocket(room);
    render(<RoomPage roomCode="ABCDE" />);

    expect(screen.getByText("YOU ARE MARKED DNF")).toBeTruthy();
    expect(screen.queryByAltText("Location screenshot to identify")).toBeNull();
    expect(screen.getByText(/cannot load round assets or submit another guess/)).toBeTruthy();
  });
});
