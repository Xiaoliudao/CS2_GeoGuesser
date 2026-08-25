import { describe, expect, it } from "vitest";
import { scoreVisibleToViewer, validateGuess, type GuessValidationInput } from "./roomState";

const valid: GuessValidationInput = {
  playerExists: true,
  status: "playing",
  submittedRound: 2,
  currentRound: 2,
  eventId: "event-a",
  processedEventIds: [],
  alreadySubmitted: false,
  now: 15_000,
  roundEndsAt: 20_000,
};

describe("guess validation", () => {
  it("accepts a current, first submission", () => {
    expect(validateGuess(valid)).toBeNull();
  });

  it("rejects a duplicate event id", () => {
    expect(validateGuess({ ...valid, processedEventIds: ["event-a"] })).toBe("ALREADY_SUBMITTED");
  });

  it("rejects a second submission with a new event id", () => {
    expect(validateGuess({ ...valid, alreadySubmitted: true })).toBe("ALREADY_SUBMITTED");
  });

  it("rejects stale rounds and expired deadlines", () => {
    expect(validateGuess({ ...valid, submittedRound: 1 })).toBe("ROUND_EXPIRED");
    expect(validateGuess({ ...valid, now: 20_001 })).toBe("ROUND_EXPIRED");
    expect(validateGuess({ ...valid, status: "round_result" })).toBe("ROUND_EXPIRED");
  });

  it("rejects a player that is not part of the room", () => {
    expect(validateGuess({ ...valid, playerExists: false })).toBe("INVALID_PLAYER");
  });
});

describe("viewer-specific score visibility", () => {
  const submittedPlayer = {
    status: "playing" as const,
    playerId: "player-a",
    totalScore: 1_697.5,
    currentRoundPoints: 497.5,
  };

  it("shows the submitting player their own updated total immediately", () => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId: "player-a" })).toBe(1_698);
  });

  it("keeps the opponent and unauthenticated sockets on the pre-round total", () => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId: "player-b" })).toBe(1_200);
    expect(scoreVisibleToViewer({ ...submittedPlayer, viewerPlayerId: null })).toBe(1_200);
  });

  it.each(["round_result", "finished", "waiting"] as const)("reveals the synchronized total during %s", (status) => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, status, viewerPlayerId: "player-b" })).toBe(1_698);
  });

  it("leaves an opponent score unchanged before that opponent submits", () => {
    expect(scoreVisibleToViewer({
      status: "playing",
      playerId: "player-b",
      viewerPlayerId: "player-a",
      totalScore: 800,
      currentRoundPoints: 0,
    })).toBe(800);
  });

  it("never exposes a negative score from inconsistent legacy state", () => {
    expect(scoreVisibleToViewer({ ...submittedPlayer, totalScore: 10, currentRoundPoints: 20, viewerPlayerId: "player-b" })).toBe(0);
  });
});
