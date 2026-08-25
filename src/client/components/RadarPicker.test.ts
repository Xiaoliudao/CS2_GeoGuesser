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

  it("preserves sub-pixel floating-point precision without snapping", () => {
    const preciseRect = { left: 13.25, top: 7.75, width: 613.5, height: 487.25 };
    const point = pointFromImageRect(preciseRect, 241.987654, 193.456789);

    expect(point.x).toBeCloseTo((241.987654 - preciseRect.left) / preciseRect.width, 12);
    expect(point.y).toBeCloseTo((193.456789 - preciseRect.top) / preciseRect.height, 12);
    expect(point.x).not.toBe(Math.round(point.x * 100) / 100);
    expect(point.y).not.toBe(Math.round(point.y * 100) / 100);
  });
});
