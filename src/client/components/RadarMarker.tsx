import type { MapPoint } from "../../shared/types";

export interface RadarMarkerProps {
  point: MapPoint;
  className: string;
  label: string;
  ariaLabel: string;
}

export function RadarMarker({ point, className, label, ariaLabel }: RadarMarkerProps) {
  return (
    <span
      className={`radar-marker ${className}`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
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
