import { describe, expect, it } from "vitest";
import { formatScore, integerDisplayScore } from "./formatScore";

describe("score display", () => {
  it("never renders fractions or invalid negative values", () => {
    expect(integerDisplayScore(19.5)).toBe(20);
    expect(integerDisplayScore(-5.2)).toBe(0);
    expect(integerDisplayScore(Number.NaN)).toBe(0);
    expect(formatScore(1_234.49)).toBe((1_234).toLocaleString());
  });
});
