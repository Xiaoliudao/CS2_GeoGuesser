import { MAPS, type MapId } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";

export function mapsForPool(mapPool: MapId[]) {
  return MAPS.filter((map) => mapPool.includes(map.id));
}

export function MapSelector({
  mapPool,
  assetOrigin = "",
  onSelect,
  disabled = false,
}: {
  mapPool: MapId[];
  assetOrigin?: string;
  onSelect: (mapId: MapId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="map-selector" aria-label="Choose a map">
      {mapsForPool(mapPool).map((map) => (
        <button key={map.id} type="button" onClick={() => onSelect(map.id)} disabled={disabled}>
          <img src={radarMediaUrl(map.id, map.layers[0].id, assetOrigin)} alt="" />
          <span>{map.name}</span>
        </button>
      ))}
    </div>
  );
}
