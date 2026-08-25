import type { MapId, RadarLayerId } from "../../shared/maps";
import {
  LAYER_SCORE,
  MAP_SCORE,
  MAX_LOCATION_SCORE,
  MAX_TIME_BONUS,
} from "../../shared/scoring";
import type { MapPoint } from "../../shared/types";
import type { Question } from "./questions";

export const MAX_LOCATION_DISTANCE = 0.35;
export { LAYER_SCORE, MAP_SCORE, MAX_LOCATION_SCORE, MAX_ROUND_SCORE, MAX_TIME_BONUS } from "../../shared/scoring";

export interface ScoreResult {
  mapCorrect: boolean;
  layerCorrect: boolean;
  distance: number | null;
  mapScore: number;
  layerScore: number;
  locationScore: number;
  timeBonus: number;
  points: number;
  elapsedMs: number;
}

export function distanceBetween(first: MapPoint, second: MapPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function normalizeScore(points: number): number {
  return Number.isFinite(points) ? Math.max(0, Math.round(points)) : 0;
}

export function calculateTimeBonus(elapsedMs: number, roundDurationMs: number): number {
  const boundedDurationMs = Math.max(1, roundDurationMs);
  const boundedElapsedMs = Math.min(boundedDurationMs, Math.max(0, elapsedMs));
  const bonus = (MAX_TIME_BONUS * (boundedDurationMs - boundedElapsedMs)) / boundedDurationMs;
  return normalizeScore(bonus);
}

export function scoreGuess(
  question: Question,
  mapId: MapId,
  layerId: RadarLayerId,
  point: MapPoint,
  roundStartedAt: number,
  submittedAt: number,
  roundDurationMs: number,
): ScoreResult {
  const mapCorrect = mapId === question.correctMapId;
  const elapsedMs = Math.max(0, submittedAt - roundStartedAt);
  if (!mapCorrect) {
    return {
      mapCorrect: false,
      layerCorrect: false,
      distance: null,
      mapScore: 0,
      layerScore: 0,
      locationScore: 0,
      timeBonus: 0,
      points: 0,
      elapsedMs,
    };
  }

  if (layerId !== question.correctLayerId) {
    return {
      mapCorrect: true,
      layerCorrect: false,
      distance: null,
      mapScore: MAP_SCORE,
      layerScore: 0,
      locationScore: 0,
      timeBonus: 0,
      points: MAP_SCORE,
      elapsedMs,
    };
  }

  const distance = distanceBetween(point, question.correctPoint);
  const accuracy = Math.max(0, 1 - distance / MAX_LOCATION_DISTANCE);
  const locationScore = distance >= MAX_LOCATION_DISTANCE
    ? 0
    : Math.round(MAX_LOCATION_SCORE * accuracy * accuracy);
  const timeBonus = calculateTimeBonus(elapsedMs, roundDurationMs);

  return {
    mapCorrect: true,
    layerCorrect: true,
    distance,
    mapScore: MAP_SCORE,
    layerScore: LAYER_SCORE,
    locationScore,
    timeBonus,
    points: normalizeScore(MAP_SCORE + LAYER_SCORE + locationScore + timeBonus),
    elapsedMs,
  };
}
