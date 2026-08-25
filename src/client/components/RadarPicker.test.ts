import { describe, expect, it } from "vitest";
import { pointFromImageRect } from "./RadarPicker";

describe("radar click coordinates", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it("uses the rendered image rectangle", () => {
    expect(pointFromImageRect(rect, 300, 100)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("clamps clicks to normalized bounds", () => {
    expect(pointFromImageRect(rect, 20, 400)).toEqual({ x: 0, y: 1 });
  });

  it("uses a top-left browser origin at all five reference positions", () => {
    expect(pointFromImageRect(rect, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(pointFromImageRect(rect, 500, 50)).toEqual({ x: 1, y: 0 });
    expect(pointFromImageRect(rect, 100, 250)).toEqual({ x: 0, y: 1 });
    expect(pointFromImageRect(rect, 500, 250)).toEqual({ x: 1, y: 1 });
    expect(pointFromImageRect(rect, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
  });
});
