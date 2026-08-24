import { describe, expect, it } from "vitest";
import { parseGetpos, parsePosition } from "./getpos";

describe("CS2 getpos parsing", () => {
  it("parses the console's setpos_exact and setang_exact commands", () => {
    expect(parseGetpos("setpos_exact -3230.25 1713 64;setang_exact 4.5 92 -0.25")).toEqual({
      worldPosition: { x: -3230.25, y: 1713, z: 64 },
      viewAngle: { pitch: 4.5, yaw: 92, roll: -0.25 },
    });
  });

  it("rejects incomplete and non-finite positions", () => {
    expect(() => parsePosition("1 2")).toThrow();
    expect(() => parsePosition("1 NaN 3")).toThrow();
  });

  it("parses getposcopy_exact clipboard text with whitespace, newlines, and negative decimals", () => {
    expect(parseGetpos("  setpos_exact   -123.75   456.125  -789.5 ;\r\n  setang_exact  -8.25  179.5  0.0  ")).toEqual({
      worldPosition: { x: -123.75, y: 456.125, z: -789.5 },
      viewAngle: { pitch: -8.25, yaw: 179.5, roll: 0 },
    });
  });
});
