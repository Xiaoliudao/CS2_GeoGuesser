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
  /**
   * Valve overview presentation metadata. The synchronized `*_radar_psd`
   * image is already in the top-left-origin orientation described by posX,
   * posY, scale, and the overview landmark coordinates, so this value must not
   * be applied to world coordinates a second time.
   */
  rotate: number;
  zoom: number;
  layers: readonly RadarLayerOverview[];
  extractedAt: string;
  sourceBuildId: string;
}

export class RadarCoordinateError extends Error {}

export interface RadarCoordinateDiagnostic {
  overview: {
    mapId: MapId;
    sourceName: string;
    posX: number;
    posY: number;
    scale: number;
    rotate: number;
    sourceBuildId: string;
  };
  layerId: string;
  rawPixelX: number;
  rawPixelY: number;
  normalizedXBeforeTransform: number;
  normalizedYBeforeTransform: number;
  coordinateTransform: "none";
  rotateMetadataApplied: false;
  normalizedXAfterTransform: number;
  normalizedYAfterTransform: number;
  radarWidth: number;
  radarHeight: number;
  final: MapPoint;
}

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
  return traceWorldToRadarPoint(position, overview, layer).final;
}

export function traceWorldToRadarPoint(
  position: WorldPosition,
  overview: MapOverview,
  layer: RadarLayerOverview,
): RadarCoordinateDiagnostic {
  if (!Number.isFinite(overview.scale) || overview.scale <= 0) throw new RadarCoordinateError("Overview scale must be positive and finite.");
  if (!Number.isFinite(layer.radarWidth) || !Number.isFinite(layer.radarHeight) || layer.radarWidth <= 0 || layer.radarHeight <= 0) {
    throw new RadarCoordinateError("Extracted radar dimensions must be positive and finite.");
  }
  if (!Number.isInteger(overview.rotate) || overview.rotate < 0 || overview.rotate > 3) {
    throw new RadarCoordinateError("Overview rotate must be a quarter-turn value from 0 through 3.");
  }

  const rawPixelX = (position.x - overview.posX) / overview.scale;
  const rawPixelY = (overview.posY - position.y) / overview.scale;
  const normalizedXBeforeTransform = rawPixelX / layer.radarWidth;
  const normalizedYBeforeTransform = rawPixelY / layer.radarHeight;

  // Browser image coordinates and the extracted overview asset both use a
  // top-left origin. `rotate` is retained for source auditing, but rotating the
  // point here would rotate it twice relative to the synchronized radar image.
  const normalizedXAfterTransform = normalizedXBeforeTransform;
  const normalizedYAfterTransform = normalizedYBeforeTransform;
  const point = { x: normalizedXAfterTransform, y: normalizedYAfterTransform };
  if (![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new RadarCoordinateError(`World position maps outside the radar: x=${point.x}, y=${point.y}.`);
  }
  return {
    overview: {
      mapId: overview.mapId,
      sourceName: overview.sourceName,
      posX: overview.posX,
      posY: overview.posY,
      scale: overview.scale,
      rotate: overview.rotate,
      sourceBuildId: overview.sourceBuildId,
    },
    layerId: layer.id,
    rawPixelX,
    rawPixelY,
    normalizedXBeforeTransform,
    normalizedYBeforeTransform,
    coordinateTransform: "none",
    rotateMetadataApplied: false,
    normalizedXAfterTransform,
    normalizedYAfterTransform,
    radarWidth: layer.radarWidth,
    radarHeight: layer.radarHeight,
    final: point,
  };
}
