import { useEffect, useState } from "react";
import type { ClientEvent } from "../../shared/protocol";
import { getMap, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import { MapSelector } from "./MapSelector";
import { RadarPicker } from "./RadarPicker";

export function GuessPanel({
  questionId,
  round,
  submitted,
  expired,
  onSend,
}: {
  questionId: string;
  round: number;
  submitted: boolean;
  expired: boolean;
  onSend: (event: ClientEvent) => boolean;
}) {
  const [mapId, setMapId] = useState<MapId | null>(null);
  const [layerId, setLayerId] = useState<RadarLayerId>("main");
  const [point, setPoint] = useState<MapPoint | null>(null);

  useEffect(() => {
    setMapId(null);
    setLayerId("main");
    setPoint(null);
  }, [questionId]);

  const changeMap = () => {
    if (submitted) return;
    setMapId(null);
    setLayerId("main");
    setPoint(null);
  };

  const confirm = () => {
    if (!mapId || !point || submitted || expired) return;
    onSend({
      type: "guess:submit",
      payload: { round, eventId: crypto.randomUUID(), mapId, layerId, point },
    });
  };

  return (
    <section className="guess-workspace">
      {!mapId ? (
        <>
          <div className="panel-kicker">STEP 1 · SELECT MAP</div>
          <h2>WHERE IS THIS LOCATION?</h2>
          <p>Choose the battleground, then pinpoint the exact position.</p>
          <MapSelector onSelect={(selected) => {
            const firstLayer = getMap(selected).layers[0];
            setMapId(selected);
            setLayerId(firstLayer.id);
            setPoint(null);
          }} disabled={submitted || expired} />
        </>
      ) : (
        <>
          <button className="change-map-button" type="button" onClick={changeMap} disabled={submitted}>← CHANGE MAP</button>
          <div className="radar-title"><span>STEP 2 · PINPOINT</span><strong>{getMap(mapId).name}</strong></div>
          {getMap(mapId).layers.length > 1 && (
            <div className="layer-tabs" role="group" aria-label="Radar floor">
              {getMap(mapId).layers.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={layerId === layer.id ? "is-active" : ""}
                  onClick={() => { setLayerId(layer.id); setPoint(null); }}
                  disabled={submitted || expired}
                >{layer.name}</button>
              ))}
            </div>
          )}
          <RadarPicker mapId={mapId} layerId={layerId} value={point} onChange={setPoint} disabled={submitted || expired} />
          <button className="primary-button confirm-guess" type="button" onClick={confirm} disabled={!point || submitted || expired}>
            {submitted ? "GUESS CONFIRMED ✓" : expired ? "ROUND EXPIRED" : "CONFIRM GUESS"}
          </button>
        </>
      )}
    </section>
  );
}
