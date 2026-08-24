import { MAPS, type MapId } from "../../shared/maps";

export function MapSelector({ onSelect, disabled = false }: { onSelect: (mapId: MapId) => void; disabled?: boolean }) {
  return (
    <div className="map-selector" aria-label="Choose a map">
      {MAPS.map((map) => (
        <button key={map.id} type="button" onClick={() => onSelect(map.id)} disabled={disabled}>
          <img src={map.layers[0].radarUrl} alt="" />
          <span>{map.name}</span>
        </button>
      ))}
    </div>
  );
}
