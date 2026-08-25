import { describe, expect, it } from "vitest";
import { createPlayingRoundTiming, createPreparingRoundTiming } from "./roundTiming";

describe("authoritative round timing", () => {
  it("keeps prepare time separate from the configured playing duration", () => {
    const prepareStartedAt = 1_000_000;
    const preparing = createPreparingRoundTiming(prepareStartedAt, 12_000);
    const playing = createPlayingRoundTiming(
      "round_preparing",
      "question-1",
      preparing.prepareDeadline!,
      { roundDurationSeconds: 20 },
    );

    expect(preparing).toEqual({
      prepareDeadline: prepareStartedAt + 12_000,
      roundStartedAt: null,
      roundEndsAt: null,
    });
    expect(playing).toEqual({
      prepareDeadline: null,
      roundStartedAt: prepareStartedAt + 12_000,
      roundEndsAt: prepareStartedAt + 32_000,
    });
    expect(playing!.roundEndsAt! - playing!.roundStartedAt!).toBe(20_000);
  });

  it("cannot recalculate a deadline after the room has already started", () => {
    expect(createPlayingRoundTiming("playing", "question-1", 2_000_000, { roundDurationSeconds: 20 })).toBeNull();
    expect(createPlayingRoundTiming("round_preparing", null, 2_000_000, { roundDurationSeconds: 20 })).toBeNull();
  });
});
