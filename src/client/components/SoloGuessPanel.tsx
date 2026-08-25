import { useEffect, useState } from "react";
import { getMap, type MapId, type RadarLayerId } from "../../shared/maps";
import { radarMediaUrl } from "../../shared/mediaUrls";
import type { MapPoint } from "../../shared/types";
import { MapSelector } from "./MapSelector";
import { RadarPicker } from "./RadarPicker";

export interface SoloGuessValue {
  mapId: MapId;
  layerId: RadarLayerId;
  point: MapPoint;
}

export function SoloGuessPanel({
  questionId,
  mapPool,
  assetOrigin,
  hintMapId,
  expired,
  busy,
  onHint,
  onSubmit,
}: {
  questionId: string;
  mapPool: MapId[];
  assetOrigin: string;
  hintMapId: MapId | null;
  expired: boolean;
  busy: boolean;
  onHint: () => Promise<unknown>;
  onSubmit: (guess: SoloGuessValue) => Promise<unknown>;
}) {
  const [mapId, setMapId] = useState<MapId | null>(null);
  const [layerId, setLayerId] = useState<RadarLayerId>("main");
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [confirmingHint, setConfirmingHint] = useState(false);

  useEffect(() => {
    setMapId(null);
    setLayerId("main");
    setPoint(null);
    setConfirmingHint(false);
  }, [questionId]);

  useEffect(() => {
    if (!hintMapId) return;
    const firstLayer = getMap(hintMapId).layers[0];
    setMapId(hintMapId);
    setLayerId(firstLayer.id);
    setPoint(null);
    setConfirmingHint(false);
  }, [hintMapId, questionId]);

  const disabled = busy || expired;
  const selectMap = (selected: MapId) => {
    const firstLayer = getMap(selected).layers[0];
    setMapId(selected);
    setLayerId(firstLayer.id);
    setPoint(null);
  };

  return (
    <section className="guess-workspace solo-guess-workspace">
      <div className={`solo-hint ${hintMapId ? "is-revealed" : ""}`} aria-live="polite">
        {hintMapId ? (
          <div className="solo-hint-reveal">
            <span>HINT USED ✓</span>
            <strong>THIS LOCATION IS ON {getMap(hintMapId).name.toUpperCase()}</strong>
          </div>
        ) : confirmingHint ? (
          <div className="solo-hint-confirm">
            <span>Reveal the correct map?</span>
            <div>
              <button type="button" onClick={() => setConfirmingHint(false)} disabled={disabled}>CANCEL</button>
              <button className="is-reveal" type="button" onClick={() => void onHint()} disabled={disabled}>REVEAL MAP</button>
            </div>
          </div>
        ) : (
          <button className="solo-hint-button" type="button" onClick={() => setConfirmingHint(true)} disabled={disabled}>
            HINT <span>REVEAL MAP</span>
          </button>
        )}
      </div>

      {!mapId ? (
        <>
          <div className="panel-kicker">STEP 1 · SELECT MAP</div>
          <h2>WHERE IS THIS LOCATION?</h2>
          <p>Choose the battleground, then pinpoint the exact position.</p>
          <MapSelector mapPool={mapPool} assetOrigin={assetOrigin} onSelect={selectMap} disabled={disabled} />
        </>
      ) : (
        <>
          <button className="change-map-button" type="button" onClick={() => { setMapId(null); setLayerId("main"); setPoint(null); }} disabled={disabled}>← CHANGE MAP</button>
          <div className="radar-title"><span>STEP 2 · PINPOINT</span><strong>{getMap(mapId).name}</strong></div>
          {getMap(mapId).layers.length > 1 && (
            <div className="layer-tabs" role="group" aria-label="Radar floor">
              {getMap(mapId).layers.map((layer) => (
                <button key={layer.id} type="button" className={layerId === layer.id ? "is-active" : ""} onClick={() => { setLayerId(layer.id); setPoint(null); }} disabled={disabled}>{layer.name}</button>
              ))}
            </div>
          )}
          <RadarPicker
            mapId={mapId}
            layerId={layerId}
            radarUrl={radarMediaUrl(mapId, layerId, assetOrigin)}
            value={point}
            onChange={setPoint}
            disabled={disabled}
          />
          <button className="primary-button confirm-guess" type="button" onClick={() => point && void onSubmit({ mapId, layerId, point })} disabled={!point || disabled}>
            {busy ? "SUBMITTING…" : expired ? "ROUND EXPIRED" : "CONFIRM GUESS"}
          </button>
        </>
      )}
    </section>
  );
}
