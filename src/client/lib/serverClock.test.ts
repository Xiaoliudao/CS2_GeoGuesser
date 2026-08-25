import { describe, expect, it } from "vitest";
import { estimatedServerNow, ServerClockEstimator, createServerClockSample } from "./serverClock";

describe("server clock synchronization", () => {
  it("shows actual remaining time for clients with different latency and wildly wrong clocks", () => {
    const roundStartedAt = 1_000_000;
    const roundEndsAt = roundStartedAt + 20_000;

    const fastClockSkew = 120_000;
    const fastSentAt = roundStartedAt + fastClockSkew;
    const fastReceivedAt = fastSentAt + 100;
    const fastSample = createServerClockSample(fastSentAt, roundStartedAt + 50, fastReceivedAt);

    const slowClockSkew = -180_000;
    const slowSentAt = roundStartedAt + slowClockSkew;
    const slowReceivedAt = slowSentAt + 1_200;
    const slowSample = createServerClockSample(slowSentAt, roundStartedAt + 600, slowReceivedAt);

    expect(fastSample).not.toBeNull();
    expect(slowSample).not.toBeNull();
    expect(roundEndsAt - estimatedServerNow(fastReceivedAt, fastSample!.offsetMs)).toBe(19_900);
    expect(roundEndsAt - estimatedServerNow(slowReceivedAt, slowSample!.offsetMs)).toBe(18_800);
  });

  it("uses a rolling, smoothed offset and rejects an obvious RTT outlier", () => {
    const estimator = new ServerClockEstimator();
    const add = (sentAt: number, rttMs: number, actualOffsetMs: number) => estimator.addSample(
      sentAt,
      sentAt + actualOffsetMs + rttMs / 2,
      sentAt + rttMs,
    );

    add(1_000, 100, 5_000);
    add(2_000, 120, 5_000);
    add(3_000, 90, 5_000);
    add(4_000, 110, 5_000);
    const estimate = add(5_000, 5_000, 15_000);

    expect(estimate?.synchronizedOffsetMs).toBe(5_000);
    expect(estimator.addSample(0, 20_000, 20_001)).toBeNull();
  });
});
