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
});
