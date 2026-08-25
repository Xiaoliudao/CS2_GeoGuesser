import type { MapPoint } from "../../shared/types";

export const MIN_RADAR_ZOOM = 1;
export const MAX_RADAR_ZOOM = 4;
export const RADAR_ZOOM_STEP = 0.5;
export const RADAR_DRAG_THRESHOLD_PX = 5;

export interface RadarViewportState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface RadarViewportSize {
  width: number;
  height: number;
}

export interface RadarScreenPoint {
  x: number;
  y: number;
}

export const DEFAULT_RADAR_VIEWPORT: RadarViewportState = {
  scale: MIN_RADAR_ZOOM,
  translateX: 0,
  translateY: 0,
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function clampRadarScale(scale: number) {
  return clamp(scale, MIN_RADAR_ZOOM, MAX_RADAR_ZOOM);
}

export function clampRadarViewport(
  viewport: RadarViewportState,
  size: RadarViewportSize,
): RadarViewportState {
  const scale = clampRadarScale(viewport.scale);
  if (size.width <= 0 || size.height <= 0 || scale === MIN_RADAR_ZOOM) {
    return { scale, translateX: 0, translateY: 0 };
  }

  return {
    scale,
    translateX: clamp(viewport.translateX, size.width - size.width * scale, 0),
    translateY: clamp(viewport.translateY, size.height - size.height * scale, 0),
  };
}

export function screenPointToRadarPoint(
  viewport: RadarViewportState,
  size: RadarViewportSize,
  screenPoint: RadarScreenPoint,
): MapPoint {
  if (size.width <= 0 || size.height <= 0 || viewport.scale <= 0) return { x: 0, y: 0 };
  return {
    x: clamp((screenPoint.x - viewport.translateX) / (size.width * viewport.scale), 0, 1),
    y: clamp((screenPoint.y - viewport.translateY) / (size.height * viewport.scale), 0, 1),
  };
}

export function radarPointToScreenPoint(
  viewport: RadarViewportState,
  size: RadarViewportSize,
  radarPoint: MapPoint,
): RadarScreenPoint {
  return {
    x: viewport.translateX + radarPoint.x * size.width * viewport.scale,
    y: viewport.translateY + radarPoint.y * size.height * viewport.scale,
  };
}

export function zoomRadarAtPoint(
  viewport: RadarViewportState,
  size: RadarViewportSize,
  focalPoint: RadarScreenPoint,
  nextScale: number,
): RadarViewportState {
  const radarPoint = screenPointToRadarPoint(viewport, size, focalPoint);
  return placeRadarPointAtScreenPoint(radarPoint, focalPoint, nextScale, size);
}

export function placeRadarPointAtScreenPoint(
  radarPoint: MapPoint,
  screenPoint: RadarScreenPoint,
  scale: number,
  size: RadarViewportSize,
): RadarViewportState {
  const nextScale = clampRadarScale(scale);
  return clampRadarViewport({
    scale: nextScale,
    translateX: screenPoint.x - radarPoint.x * size.width * nextScale,
    translateY: screenPoint.y - radarPoint.y * size.height * nextScale,
  }, size);
}

export function movedBeyondRadarDragThreshold(start: RadarScreenPoint, current: RadarScreenPoint) {
  return Math.hypot(current.x - start.x, current.y - start.y) > RADAR_DRAG_THRESHOLD_PX;
}
