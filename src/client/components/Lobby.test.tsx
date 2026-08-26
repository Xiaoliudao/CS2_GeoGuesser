// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS, type RoomSettingsUpdate } from "../../shared/roomSettings";
import type { GameRoomState } from "../../shared/types";
import { Lobby } from "./Lobby";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockAvailability(availableQuestions = 50) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ availableQuestions, byMap: {}, byDifficulty: {} }),
  }) as Response));
}

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

  it("shows the selected difficulty pool in the waiting room", () => {
    const room = waitingRoom(false);
    room.settings.difficultyPool = ["easy", "hell"];
    render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} />);

    const settings = screen.getByLabelText("Match settings");
    expect(settings.textContent).toContain("5 ROUNDS · 20 SEC · ALL MAPS · EASY + HELL");
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

  it("shows kick controls only to the host and never allows targeting the host", async () => {
    const user = userEvent.setup();
    const room = waitingRoom(true);
    const onKick = vi.fn();
    const { rerender } = render(
      <Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onKick={onKick} />,
    );

    expect(screen.queryByRole("button", { name: "Kick Alpha" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kick Bravo" }));
    expect(onKick).toHaveBeenCalledWith("player-b");

    rerender(<Lobby room={room} playerId="player-b" onReady={vi.fn()} onStart={vi.fn()} onKick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Kick / })).toBeNull();
  });

  it("keeps start disabled until at least two connected active players are ready", () => {
    const room = waitingRoom(true);
    room.players[1].active = false;
    render(<Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} />);

    expect((screen.getByRole("button", { name: "START MATCH" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/AT LEAST ONE MORE PLAYER/)).toBeTruthy();
  });

  it("shows the editor only to the authoritative host and initializes it from the room", async () => {
    mockAvailability();
    const room = waitingRoom(false);
    room.settings = {
      totalRounds: 7,
      roundDurationSeconds: 60,
      mapPool: ["ancient"],
      difficultyPool: ["hell"],
      serverRegion: "asia",
    };
    const { rerender } = render(
      <Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    expect((screen.getByLabelText("Custom question count") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Custom round duration in seconds") as HTMLInputElement).value).toBe("60");
    expect(screen.getByRole("checkbox", { name: "Ancient" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "HELL" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Server region ASIA").textContent).toContain("Fixed for this room");
    expect(screen.queryByRole("button", { name: "ASIA" })).toBeNull();

    rerender(<Lobby room={room} playerId="player-b" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /EDIT SETTINGS|HIDE SETTINGS/ })).toBeNull();
  });

  it("keeps edits as a draft, restores authoritative values on cancel, and omits serverRegion on apply", async () => {
    mockAvailability();
    const room = waitingRoom(false);
    const onUpdateSettings = vi.fn((_settings: RoomSettingsUpdate) => true);
    render(
      <Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={onUpdateSettings} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    const roundsInput = screen.getByLabelText("Custom question count");
    await userEvent.clear(roundsInput);
    await userEvent.type(roundsInput, "7");
    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(onUpdateSettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    expect((screen.getByLabelText("Custom question count") as HTMLInputElement).value).toBe("5");
    await userEvent.click(screen.getByRole("button", { name: "30s" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "APPLY SETTINGS" }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "APPLY SETTINGS" }));

    expect(onUpdateSettings).toHaveBeenCalledOnce();
    const submitted = onUpdateSettings.mock.calls[0][0];
    expect(submitted).toEqual({
      totalRounds: 5,
      roundDurationSeconds: 30,
      mapPool: room.settings.mapPool,
      difficultyPool: room.settings.difficultyPool,
    });
    expect(submitted).not.toHaveProperty("serverRegion");
    expect(screen.getByRole("button", { name: "APPLYING…" })).toBeTruthy();
  });

  it("collapses after the authoritative update and tells everyone to ready again", async () => {
    mockAvailability();
    const room = waitingRoom(true);
    room.players[1].ready = true;
    const onUpdateSettings = vi.fn((_settings: RoomSettingsUpdate) => true);
    const { rerender } = render(
      <Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={onUpdateSettings} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    await userEvent.click(screen.getByRole("button", { name: "30s" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "APPLY SETTINGS" }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "APPLY SETTINGS" }));

    const updatedRoom: GameRoomState = {
      ...room,
      settings: { ...room.settings, roundDurationSeconds: 30 },
      players: room.players.map((player) => ({ ...player, ready: false })),
      stateVersion: room.stateVersion + 1,
    };
    rerender(
      <Lobby room={updatedRoom} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={onUpdateSettings} />,
    );

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("EVERYONE MUST READY UP AGAIN"));
    expect(screen.getByRole("button", { name: "EDIT SETTINGS" })).toBeTruthy();
    expect(screen.getAllByText("NOT READY")).toHaveLength(2);
  });

  it("keeps a rejected update open with a useful server error and no optimistic mutation", async () => {
    mockAvailability();
    const room = waitingRoom(true);
    room.players[1].ready = true;
    const onUpdateSettings = vi.fn((_settings: RoomSettingsUpdate) => true);
    const clearError = vi.fn();
    const { rerender } = render(
      <Lobby
        room={room}
        playerId="player-a"
        onReady={vi.fn()}
        onStart={vi.fn()}
        onUpdateSettings={onUpdateSettings}
        settingsError={null}
        onClearSettingsError={clearError}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    await userEvent.click(screen.getByRole("button", { name: "30s" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "APPLY SETTINGS" }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "APPLY SETTINGS" }));

    rerender(
      <Lobby
        room={room}
        playerId="player-a"
        onReady={vi.fn()}
        onStart={vi.fn()}
        onUpdateSettings={onUpdateSettings}
        settingsError={{ code: "NOT_ENOUGH_QUESTIONS", message: "Only 2 questions are currently available." }}
        onClearSettingsError={clearError}
      />,
    );

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Only 2 questions"));
    expect(screen.getByRole("button", { name: "APPLY SETTINGS" })).toBeTruthy();
    expect(room.settings.roundDurationSeconds).toBe(20);
    expect(room.players.every((player) => player.ready)).toBe(true);
  });

  it("treats an unchanged apply as an idempotent local success", async () => {
    mockAvailability();
    const room = waitingRoom(false);
    const onUpdateSettings = vi.fn((_settings: RoomSettingsUpdate) => true);
    render(
      <Lobby room={room} playerId="player-a" onReady={vi.fn()} onStart={vi.fn()} onUpdateSettings={onUpdateSettings} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "EDIT SETTINGS" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "APPLY SETTINGS" }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "APPLY SETTINGS" }));

    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("ALREADY CURRENT");
    expect(screen.getByRole("button", { name: "EDIT SETTINGS" })).toBeTruthy();
  });
});
