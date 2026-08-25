import type { MapId, RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import type { PublicQuestion } from "../../shared/types";
import type { ViewAngle, WorldPosition } from "../../shared/radarCoordinates";

export interface ServerQuestion {
  id: string;
  imageAssetKey: string;
  correctMapId: MapId;
  correctLayerId: RadarLayerId;
  correctPoint: MapPoint;
  automaticPoint?: MapPoint;
  worldPosition?: WorldPosition;
  viewAngle?: ViewAngle;
  coordinateSource: "world-conversion" | "manual-override";
}

// Type-only compatibility for the checked-in legacy migration input. Production
// Worker code never imports the generated manifest.
export interface LegacyManifestQuestion extends Omit<ServerQuestion, "imageAssetKey"> {
  imageAssetId: string;
}

// Kept as a compatibility alias for the pure scoring module and its tests.
export type Question = ServerQuestion;

export function toPublicQuestion(question: ServerQuestion): PublicQuestion {
  return { questionId: question.id, imageUrl: `/media/questions/${question.id}` };
}
