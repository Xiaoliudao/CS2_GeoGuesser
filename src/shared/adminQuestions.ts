import type { MapId, RadarLayerId } from "./maps";
import type { ViewAngle, WorldPosition } from "./radarCoordinates";
import type { MapPoint } from "./types";

export interface AdminSession {
  email: string;
}

export interface AdminQuestion {
  id: string;
  mapId: MapId;
  layerId: RadarLayerId;
  correctPoint: MapPoint;
  automaticPoint?: MapPoint;
  worldPosition?: WorldPosition;
  viewAngle?: ViewAngle;
  coordinateSource: "world-conversion" | "manual-override";
  enabled: boolean;
  contentHash: string | null;
  sourcePreviewId: string | null;
  imageUrl: string;
  radarUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuestionListResponse {
  questions: AdminQuestion[];
}

export interface AdminQuestionMutationResponse {
  question: AdminQuestion;
}
