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
});
