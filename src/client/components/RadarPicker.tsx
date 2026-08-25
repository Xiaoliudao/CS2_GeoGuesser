import { getMap, getRadarLayer, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import { RadarMarker } from "./RadarMarker";
import { RadarViewport } from "./RadarViewport";
import { screenPointToRadarPoint } from "./radarViewportMath";

export interface RadarPickerProps {
  mapId: MapId;
  layerId: RadarLayerId;
  value: MapPoint | null;
  onChange: (point: MapPoint) => void;
  disabled?: boolean;
  radarUrl?: string;
  markerLabel?: string;
  markerMode?: "auto" | "manual";
}

export function pointFromImageRect(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
): MapPoint {
  return screenPointToRadarPoint(
    { scale: 1, translateX: 0, translateY: 0 },
    { width: rect.width, height: rect.height },
    { x: clientX - rect.left, y: clientY - rect.top },
  );
}

export function RadarPicker({
  mapId,
  layerId,
  value,
  onChange,
  disabled = false,
  radarUrl,
  markerLabel = "YOUR GUESS",
  markerMode = "manual",
}: RadarPickerProps) {
  const map = getMap(mapId);
  const layer = getRadarLayer(mapId, layerId);
  if (!layer) throw new Error(`Unknown radar layer ${mapId}/${layerId}.`);
  return (
    <div className={`radar-picker ${disabled ? "is-disabled" : ""}`}>
      <RadarViewport
        src={radarUrl ?? layer.radarUrl}
        alt={`${map.name} ${layer.name.toLowerCase()} radar. Tap to place a guess or drag to pan.`}
        pointSelectionEnabled={!disabled}
        onPointSelect={onChange}
      >
        {value && (
          <RadarMarker
            point={value}
            className={`guess-marker ${markerMode === "auto" ? "is-auto" : "is-manual"}`}
            label={markerLabel}
            ariaLabel={`Guess at ${(value.x * 100).toFixed(3)}%, ${(value.y * 100).toFixed(3)}%`}
          />
        )}
      </RadarViewport>
      {!value && !disabled && <p className="radar-instruction">TAP TO MARK · DRAG TO PAN · PINCH OR SCROLL TO ZOOM</p>}
    </div>
  );
}
