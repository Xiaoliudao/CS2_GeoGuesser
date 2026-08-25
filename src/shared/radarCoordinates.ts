import type { MapId } from "./maps";
import type { MapPoint } from "./types";

export interface WorldPosition { x: number; y: number; z: number }
export interface ViewAngle { pitch: number; yaw: number; roll: number }

export interface RadarLayerOverview {
  id: string;
  sourceSectionName: string;
  radarWidth: number;
  radarHeight: number;
  altitudeMin?: number;
  altitudeMax?: number;
}

export interface MapOverview {
  mapId: MapId;
  sourceName: string;
  posX: number;
  posY: number;
  scale: number;
  rotate: number;
  zoom: number;
  layers: readonly RadarLayerOverview[];
  extractedAt: string;
  sourceBuildId: string;
}

export class RadarCoordinateError extends Error {}

export function selectRadarLayer(position: WorldPosition, overview: MapOverview): RadarLayerOverview {
  if (overview.layers.length === 1 && overview.layers[0].altitudeMin === undefined && overview.layers[0].altitudeMax === undefined) {
    return overview.layers[0];
  }
  const layer = overview.layers.find((candidate) => {
    const minimum = candidate.altitudeMin ?? Number.NEGATIVE_INFINITY;
    const maximum = candidate.altitudeMax ?? Number.POSITIVE_INFINITY;
    return position.z >= minimum && position.z <= maximum;
  });
  if (!layer) throw new RadarCoordinateError(`World Z ${position.z} does not match an extracted vertical section.`);
  return layer;
}

export function worldToRadarPoint(
  position: WorldPosition,
  overview: MapOverview,
  layer: RadarLayerOverview,
): MapPoint {
  if (!Number.isFinite(overview.scale) || overview.scale <= 0) throw new RadarCoordinateError("Overview scale must be positive and finite.");
  if (!Number.isFinite(layer.radarWidth) || !Number.isFinite(layer.radarHeight) || layer.radarWidth <= 0 || layer.radarHeight <= 0) {
    throw new RadarCoordinateError("Extracted radar dimensions must be positive and finite.");
  }

  let pixelX = (position.x - overview.posX) / overview.scale;
  let pixelY = (overview.posY - position.y) / overview.scale;
  if (!Number.isInteger(overview.rotate) || overview.rotate < 0 || overview.rotate > 3) {
    throw new RadarCoordinateError("Overview rotate must be a quarter-turn value from 0 through 3.");
  }
  if (overview.rotate !== 0) {
    // Valve overview files encode clockwise quarter turns (0..3), not degrees.
    const radians = overview.rotate * Math.PI / 2;
    const centerX = layer.radarWidth / 2;
    const centerY = layer.radarHeight / 2;
    const offsetX = pixelX - centerX;
    const offsetY = pixelY - centerY;
    pixelX = centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
    pixelY = centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians);
  }

  const point = { x: pixelX / layer.radarWidth, y: pixelY / layer.radarHeight };
  if (![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new RadarCoordinateError(`World position maps outside the radar: x=${point.x}, y=${point.y}.`);
  }
  return point;
}
