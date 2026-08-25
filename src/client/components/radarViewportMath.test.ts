import { describe, expect, it } from "vitest";
import {
  clampRadarViewport,
  movedBeyondRadarDragThreshold,
  placeRadarPointAtScreenPoint,
  radarPointToScreenPoint,
  screenPointToRadarPoint,
  zoomRadarAtPoint,
} from "./radarViewportMath";

describe("radar viewport coordinate math", () => {
  const size = { width: 640, height: 480 };

  it("keeps normalized marker coordinates stable through zoom and pan", () => {
    const point = { x: 0.25, y: 0.75 };
    const viewport = { scale: 4, translateX: -723.456, translateY: -811.234 };
    const screenPoint = radarPointToScreenPoint(viewport, size, point);

    expect(screenPointToRadarPoint(viewport, size, screenPoint).x).toBeCloseTo(point.x, 12);
    expect(screenPointToRadarPoint(viewport, size, screenPoint).y).toBeCloseTo(point.y, 12);
  });

  it("maps the unzoomed visual center to the normalized center", () => {
    expect(screenPointToRadarPoint(
      { scale: 1, translateX: 0, translateY: 0 },
      size,
      { x: 320, y: 240 },
    )).toEqual({ x: 0.5, y: 0.5 });
  });

  it("maps the same visual radar location back to the same point at 4x zoom", () => {
    const viewport = { scale: 4, translateX: -960, translateY: -720 };
    const visualCenter = radarPointToScreenPoint(viewport, size, { x: 0.5, y: 0.5 });

    expect(screenPointToRadarPoint(viewport, size, visualCenter)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps the focal radar point beneath the pointer while zooming", () => {
    const focalPoint = { x: 525.25, y: 137.75 };
    const next = zoomRadarAtPoint({ scale: 1, translateX: 0, translateY: 0 }, size, focalPoint, 3);
    const radarPoint = screenPointToRadarPoint({ scale: 1, translateX: 0, translateY: 0 }, size, focalPoint);

    expect(radarPointToScreenPoint(next, size, radarPoint).x).toBeCloseTo(focalPoint.x, 12);
    expect(radarPointToScreenPoint(next, size, radarPoint).y).toBeCloseTo(focalPoint.y, 12);
  });

  it("supports moving a pinch focal point while changing scale", () => {
    const radarPoint = { x: 0.4, y: 0.6 };
    const currentMidpoint = { x: 280, y: 210 };
    const next = placeRadarPointAtScreenPoint(radarPoint, currentMidpoint, 2.5, size);

    expect(radarPointToScreenPoint(next, size, radarPoint).x).toBeCloseTo(currentMidpoint.x, 12);
    expect(radarPointToScreenPoint(next, size, radarPoint).y).toBeCloseTo(currentMidpoint.y, 12);
  });

  it("clamps zoom and pan so the radar cannot leave empty viewport space", () => {
    expect(clampRadarViewport({ scale: 1, translateX: -200, translateY: 90 }, size)).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
    expect(clampRadarViewport({ scale: 8, translateX: -9_999, translateY: 200 }, size)).toEqual({
      scale: 4,
      translateX: -1_920,
      translateY: 0,
    });
  });

  it("distinguishes a tap from movement beyond the drag threshold", () => {
    expect(movedBeyondRadarDragThreshold({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(false);
    expect(movedBeyondRadarDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true);
  });
});
