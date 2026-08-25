import { describe, expect, it } from "vitest";
import {
  MAX_ASSET_PREPARE_RETRIES,
  allPlayersAssetReady,
  canRetryAssetPreparation,
  hasAssetPrepareTimedOut,
  isValidAssetReport,
} from "./assetPreparation";

describe("round asset preparation", () => {
  const validReport = {
    status: "round_preparing",
    reportedRound: 2,
    currentRound: 2,
    reportedQuestionId: "q-current",
    currentQuestionId: "q-current",
  };

  it("does not start until both players report the current asset ready", () => {
    expect(allPlayersAssetReady(["a", "b"], { a: true, b: false })).toBe(false);
    expect(allPlayersAssetReady(["a", "b"], { a: true, b: true })).toBe(true);
  });

  it("rejects readiness for the wrong state, round, or question", () => {
    expect(isValidAssetReport(validReport)).toBe(true);
    expect(isValidAssetReport({ ...validReport, status: "playing" })).toBe(false);
    expect(isValidAssetReport({ ...validReport, reportedRound: 1 })).toBe(false);
    expect(isValidAssetReport({ ...validReport, reportedQuestionId: "q-other" })).toBe(false);
  });

  it("allows two replacement questions but never retries forever", () => {
    expect(canRetryAssetPreparation(0, 1, 3)).toBe(true);
    expect(canRetryAssetPreparation(1, 2, 3)).toBe(true);
    expect(canRetryAssetPreparation(MAX_ASSET_PREPARE_RETRIES, 3, 4)).toBe(false);
    expect(canRetryAssetPreparation(0, 3, 3)).toBe(false);
  });

  it("times out exactly at the bounded preparation deadline", () => {
    expect(hasAssetPrepareTimedOut(15_000, 14_999)).toBe(false);
    expect(hasAssetPrepareTimedOut(15_000, 15_000)).toBe(true);
    expect(hasAssetPrepareTimedOut(null, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
