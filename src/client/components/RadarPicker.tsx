import { getMap, getRadarLayer, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";

export interface RadarPickerProps {
  mapId: MapId;
  layerId: RadarLayerId;
  value: MapPoint | null;
  onChange: (point: MapPoint) => void;
  disabled?: boolean;
}

export function pointFromImageRect(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
): MapPoint {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp((clientX - rect.left) / rect.width),
    y: clamp((clientY - rect.top) / rect.height),
  };
}

export function RadarPicker({ mapId, layerId, value, onChange, disabled = false }: RadarPickerProps) {
  const map = getMap(mapId);
  const layer = getRadarLayer(mapId, layerId);
  if (!layer) throw new Error(`Unknown radar layer ${mapId}/${layerId}.`);
  return (
    <div className={`radar-picker ${disabled ? "is-disabled" : ""}`}>
      <div className="radar-image-wrap">
        <img
          src={layer.radarUrl}
          alt={`${map.name} ${layer.name.toLowerCase()} radar. Click to place your guess.`}
          draggable={false}
          onClick={(event) => {
            if (disabled) return;
            onChange(pointFromImageRect(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
          }}
        />
        {value && (
          <span
            className="radar-marker guess-marker"
            style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
            aria-label={`Guess at ${(value.x * 100).toFixed(1)}%, ${(value.y * 100).toFixed(1)}%`}
          >
            <i />
            <b>YOUR GUESS</b>
          </span>
        )}
      </div>
      {!value && <p className="radar-instruction">CLICK THE RADAR TO PLACE YOUR MARKER</p>}
    </div>
  );
}
