import type { MapId, RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import type { Question } from "./questions";

export const MAX_LOCATION_DISTANCE = 0.35;
export const MAP_SCORE = 200;
export const MAX_LOCATION_SCORE = 800;
export const ROUND_DURATION_MS = 20_000;
export const MAX_TIME_BONUS = 100;

export interface ScoreResult {
  mapCorrect: boolean;
  distance: number | null;
  locationScore: number;
  timeBonus: number;
  points: number;
  elapsedMs: number;
}

export function distanceBetween(first: MapPoint, second: MapPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function normalizeScore(points: number): number {
  return Math.round(points * 1_000) / 1_000;
}

export function calculateTimeBonus(elapsedMs: number): number {
  const boundedElapsedMs = Math.min(ROUND_DURATION_MS, Math.max(0, elapsedMs));
  const bonus = (MAX_TIME_BONUS * (ROUND_DURATION_MS - boundedElapsedMs)) / ROUND_DURATION_MS;
  return normalizeScore(bonus);
}

export function scoreGuess(
  question: Question,
  mapId: MapId,
  layerId: RadarLayerId,
  point: MapPoint,
  roundStartedAt: number,
  submittedAt: number,
): ScoreResult {
  const mapCorrect = mapId === question.correctMapId;
  const elapsedMs = Math.max(0, submittedAt - roundStartedAt);
  if (!mapCorrect) {
    return { mapCorrect: false, distance: null, locationScore: 0, timeBonus: 0, points: 0, elapsedMs };
  }

  if (layerId !== question.correctLayerId) {
    return { mapCorrect: true, distance: null, locationScore: 0, timeBonus: 0, points: MAP_SCORE, elapsedMs };
  }

  const distance = distanceBetween(point, question.correctPoint);
  const accuracy = Math.max(0, 1 - distance / MAX_LOCATION_DISTANCE);
  const locationScore = distance >= MAX_LOCATION_DISTANCE
    ? 0
    : Math.round(MAX_LOCATION_SCORE * accuracy * accuracy);
  const timeBonus = calculateTimeBonus(elapsedMs);

  return {
    mapCorrect: true,
    distance,
    locationScore,
    timeBonus,
    points: MAP_SCORE + locationScore + timeBonus,
    elapsedMs,
  };
}
