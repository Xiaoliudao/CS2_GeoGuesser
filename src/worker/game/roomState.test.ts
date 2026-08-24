import { describe, expect, it } from "vitest";
import { validateGuess, type GuessValidationInput } from "./roomState";

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
