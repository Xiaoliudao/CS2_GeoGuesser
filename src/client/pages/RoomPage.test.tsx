// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState, PublicPlayer } from "../../shared/types";
import { App } from "../App";
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
const leaveRoom = vi.fn<() => Promise<void>>();

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
    leaveRoom,
    leaveConfirmed: false,
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
  window.history.replaceState({}, "", "/room/ABCDE");
  send.mockClear();
  leaveRoom.mockReset();
  leaveRoom.mockResolvedValue();
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

  it("opens the waiting-room dialog and Cancel keeps the player in the room", async () => {
    mockSocket(waitingRoom(2));
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getByRole("button", { name: "LEAVE ROOM" }));
    expect(screen.getByRole("dialog", { name: "LEAVE ROOM?" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("WAITING ROOM")).toBeTruthy();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it("waits for one authoritative leave acknowledgement before navigating home", async () => {
    let resolveLeave: (() => void) | undefined;
    leaveRoom.mockReturnValue(new Promise<void>((resolve) => {
      resolveLeave = resolve;
    }));
    mockSocket(waitingRoom(2));
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getByRole("button", { name: "LEAVE ROOM" }));
    const dialog = screen.getByRole("dialog", { name: "LEAVE ROOM?" });
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "LEAVE ROOM" }));
    expect(leaveRoom).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "LEAVING…" })).toBeTruthy();
    expect(window.location.pathname).toBe("/room/ABCDE");

    resolveLeave?.();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("uses match copy during active play and Cancel preserves the match", async () => {
    const room = waitingRoom(3);
    room.status = "playing";
    room.round = 2;
    room.players[0].active = false;
    room.currentQuestion = { questionId: "q-2", imageUrl: "/media/questions/q-2" };
    room.roundStartedAt = 1_000;
    room.roundEndsAt = 21_000;
    mockSocket(room);
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getAllByRole("button", { name: "LEAVE MATCH" })[0]);
    expect(screen.getByRole("dialog", { name: "LEAVE MATCH?" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("YOU ARE MARKED DNF")).toBeTruthy();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it("recovers from an authoritative leave failure without navigating or staying stuck", async () => {
    leaveRoom.mockRejectedValueOnce(new Error("Server leave failed. Please try again."));
    mockSocket(waitingRoom(2));
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getByRole("button", { name: "LEAVE ROOM" }));
    const dialog = screen.getByRole("dialog", { name: "LEAVE ROOM?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "LEAVE ROOM" }));

    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("Please try again"));
    expect((within(dialog).getByRole("button", { name: "LEAVE ROOM" }) as HTMLButtonElement).disabled).toBe(false);
    expect(window.location.pathname).toBe("/room/ABCDE");
  });

  it("does not treat refresh, unload, or mobile visibility changes as intentional leave", () => {
    mockSocket(waitingRoom(2));
    render(<RoomPage roomCode="ABCDE" />);

    window.dispatchEvent(new Event("beforeunload"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it("uses authoritative cleanup without a destructive dialog after a complete final result", async () => {
    const room = waitingRoom(2);
    room.status = "finished";
    room.round = room.settings.totalRounds;
    mockSocket(room);
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getAllByRole("button", { name: "BACK TO HOME" })[0]);

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("does not trap a completed player when best-effort cleanup is offline", async () => {
    const room = waitingRoom(2);
    room.status = "finished";
    room.round = room.settings.totalRounds;
    leaveRoom.mockRejectedValueOnce(new Error("Connection lost."));
    mockSocket(room);
    render(<RoomPage roomCode="ABCDE" />);

    await userEvent.click(screen.getAllByRole("button", { name: "BACK TO HOME" })[0]);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(leaveRoom).toHaveBeenCalledOnce();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("uses the same confirmation flow after browser Back, including cancel and retry", async () => {
    window.history.replaceState({ page: "home" }, "", "/");
    window.history.pushState({ page: "room" }, "", "/room/ABCDE");
    mockSocket(waitingRoom(2));
    render(<App />);

    act(() => window.history.back());
    let dialog = await screen.findByRole("dialog", { name: "LEAVE ROOM?" });
    expect(window.location.pathname).toBe("/room/ABCDE");
    await userEvent.click(within(dialog).getByRole("button", { name: "CANCEL" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => window.history.back());
    dialog = await screen.findByRole("dialog", { name: "LEAVE ROOM?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "LEAVE ROOM" }));

    await waitFor(() => expect(leaveRoom).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
