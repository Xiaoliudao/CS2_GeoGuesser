import { describe, expect, it } from "vitest";
import { createCountdownBaseline, remainingFromBaseline } from "./useAuthoritativeCountdown";

describe("authoritative countdown math", () => {
  it("derives a delayed client's initial countdown from the shared server deadline", () => {
    const serverRoundStartedAt = 1_000_000;
    const localClockSkew = -180_000;
    const serverClockOffsetMs = -localClockSkew;
    const clientReceivedAt = serverRoundStartedAt + localClockSkew + 1_200;
    const baseline = createCountdownBaseline(clientReceivedAt, serverClockOffsetMs, 50_000);

    expect(remainingFromBaseline(serverRoundStartedAt + 20_000, baseline, 50_000)).toBe(18_800);
  });

  it("catches up immediately after a five-second background pause", () => {
    const baseline = createCountdownBaseline(1_004_000, 0, 10_000);
    const roundEndsAt = 1_020_000;

    expect(remainingFromBaseline(roundEndsAt, baseline, 10_000)).toBe(16_000);
    expect(remainingFromBaseline(roundEndsAt, baseline, 15_000)).toBe(11_000);
  });

  it("uses monotonic elapsed time after calibration and clamps at zero", () => {
    const baseline = createCountdownBaseline(1_000_000, 0, 100);

    expect(remainingFromBaseline(1_001_000, baseline, 600)).toBe(500);
    expect(remainingFromBaseline(1_001_000, baseline, 1_200)).toBe(0);
  });
});
