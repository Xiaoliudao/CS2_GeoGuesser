import type { MapId, RadarLayerId } from "../shared/maps.ts";
import type { MapPoint } from "../shared/types.ts";
import type { ViewAngle, WorldPosition } from "../shared/radarCoordinates.ts";

export interface PreviewQuestion {
  previewId: string;
  sourceFile: string;
  mapId: MapId;
  layerId: RadarLayerId;
  worldPosition: WorldPosition;
  viewAngle?: ViewAngle;
  automaticPoint: MapPoint;
  screenshotUrl: string;
  radarUrl: string;
  coordinateSource: "world-conversion";
}

export interface QuestionPreviewManifest {
  generatedAt: string;
  questions: PreviewQuestion[];
}

export type PreviewQuestionStatus = "preview" | "overridden" | "publish-pending" | "published";

export interface QaPreviewQuestion extends PreviewQuestion {
  manualOverride?: MapPoint;
  finalPoint: MapPoint;
  status: PreviewQuestionStatus;
}

export type QuestionOverrideMap = Record<string, MapPoint>;

export function screenshotPreviewUrl(sourceFile: string): string {
  return `/__dev_assets__/questions/${encodeURIComponent(sourceFile)}`;
}

export function radarPreviewUrl(mapId: MapId, layerId: RadarLayerId): string {
  return `/__dev_assets__/radars/${mapId}/${layerId}.webp`;
}

export function isNormalizedQuestionPoint(point: MapPoint): boolean {
  return [point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

export function getFinalQuestionPoint(question: { automaticPoint: MapPoint; manualOverride?: MapPoint | null }): MapPoint {
  return question.manualOverride ?? question.automaticPoint;
}

export function getPreviewQuestionStatus(state: { hasOverride: boolean; isPending: boolean; isPublished: boolean }): PreviewQuestionStatus {
  if (state.isPublished) return "published";
  if (state.isPending) return "publish-pending";
  if (state.hasOverride) return "overridden";
  return "preview";
}

export function updateQuestionOverrides(current: QuestionOverrideMap, previewId: string, point: MapPoint | null): QuestionOverrideMap {
  const next = { ...current };
  if (point === null) delete next[previewId];
  else {
    if (!isNormalizedQuestionPoint(point)) throw new Error("INVALID_OVERRIDE_POINT");
    next[previewId] = point;
  }
  return next;
}

export function displayedPreviewPoint(automaticPoint: MapPoint, manualOverride: MapPoint | null): MapPoint {
  return getFinalQuestionPoint({ automaticPoint, manualOverride });
}
