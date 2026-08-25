import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import type { GameRoomState } from "../../shared/types";
import { RoundPreparation } from "./RoundPreparation";

describe("RoundPreparation", () => {
  it("never renders the playing countdown or treats prepareDeadline as roundEndsAt", () => {
    const room: GameRoomState = {
      roomCode: "ABCDE",
      status: "round_preparing",
      settings: { ...DEFAULT_ROOM_SETTINGS, mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool] },
      hostPlayerId: "player-a",
      maxPlayers: 5,
      players: [
        { id: "player-a", nickname: "Alpha", slotIndex: 0, active: true, connected: true, ready: true, score: 0, submitted: false, assetReady: false },
        { id: "player-b", nickname: "Bravo", slotIndex: 1, active: true, connected: true, ready: true, score: 0, submitted: false, assetReady: false },
        { id: "player-c", nickname: "Charlie", slotIndex: 2, active: true, connected: false, ready: true, score: 0, submitted: false, assetReady: false },
      ],
      round: 1,
      questionCount: 10,
      currentQuestion: { questionId: "question-1", imageUrl: "/media/questions/question-1" },
      nextQuestion: null,
      prepareDeadline: 1_012_000,
      assetPrepareAttempt: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      roundResult: null,
      assetOrigin: "",
      failureCode: null,
      stateVersion: 4,
      serverNow: 1_000_000,
    };

    const markup = renderToStaticMarkup(createElement(RoundPreparation, {
      room,
      playerId: "player-a",
      loadState: "loading",
      errorReason: null,
      onRetry: vi.fn(),
    }));

    expect(markup).toContain("LOADING ROUND");
    expect(markup).toContain("every active player");
    expect(markup).toContain("0 / 3 READY");
    expect(markup).toContain("P3");
    expect(markup).toContain("RECONNECTING");
    expect(markup).not.toContain("TIME LEFT");
  });
});
