import { createContext } from "react";
import type { RadarViewportSize, RadarViewportState } from "./radarViewportMath";

export interface RadarMarkerOverlayTransform {
  viewport: RadarViewportState;
  size: RadarViewportSize;
}

export const RadarMarkerOverlayContext = createContext<RadarMarkerOverlayTransform | null>(null);
