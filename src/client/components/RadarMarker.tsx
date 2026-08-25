import { useContext } from "react";
import type { MapPoint } from "../../shared/types";
import { RadarMarkerOverlayContext } from "./radarMarkerOverlayContext";
import { radarPointToScreenPoint } from "./radarViewportMath";

export interface RadarMarkerProps {
  point: MapPoint;
  className: string;
  label: string;
  ariaLabel: string;
}

export function RadarMarker({ point, className, label, ariaLabel }: RadarMarkerProps) {
  const overlayTransform = useContext(RadarMarkerOverlayContext);
  const screenPoint = overlayTransform
    ? radarPointToScreenPoint(overlayTransform.viewport, overlayTransform.size, point)
    : null;
  return (
    <span
      className={`radar-marker ${className}`}
      style={screenPoint
        ? { left: screenPoint.x, top: screenPoint.y }
        : { left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      role="img"
      aria-label={ariaLabel}
    >
      <span className="radar-marker-hit-area" aria-hidden="true">
        <span className="radar-marker-visual" />
        <span className="radar-marker-center" />
        <b className="radar-marker-label">{label}</b>
      </span>
    </span>
  );
}
