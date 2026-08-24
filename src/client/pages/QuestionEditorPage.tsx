import { useMemo, useState } from "react";
import { getMap, isLayerForMap, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import { RadarPicker } from "../components/RadarPicker";

function finitePoint(params: URLSearchParams): MapPoint | null {
  const x = Number(params.get("x"));
  const y = Number(params.get("y"));
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export function QuestionEditorPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedMap = params.get("map") as MapId | null;
  const mapId: MapId = requestedMap && ["mirage", "inferno", "ancient", "nuke", "anubis", "dust2", "train", "overpass"].includes(requestedMap)
    ? requestedMap
    : "mirage";
  const requestedLayer = params.get("layer") ?? getMap(mapId).layers[0].id;
  const layerId: RadarLayerId = isLayerForMap(mapId, requestedLayer) ? requestedLayer : getMap(mapId).layers[0].id;
  const automaticPoint = useMemo(() => finitePoint(params), [params]);
  const [overridePoint, setOverridePoint] = useState<MapPoint | null>(null);
  const point = overridePoint ?? automaticPoint;
  const imageUrl = params.get("image") ?? "";
  const verification = {
    correctMapId: mapId,
    correctLayerId: layerId,
    automaticPoint,
    manualOverride: overridePoint,
    worldPosition: params.get("world") ?? "not provided",
    source: overridePoint ? "manual-override" : "world-conversion",
  };

  return (
    <main className="editor-page">
      <header><span>DEVELOPMENT QA TOOL</span><h1>QUESTION VERIFICATION</h1><p>Verify the point calculated from the captured CS2 world position. Manual placement is recorded as an override.</p></header>
      <div className="editor-layout">
        <section className="editor-controls">
          <label>MAP / LAYER</label>
          <strong>{getMap(mapId).name} · {layerId.toUpperCase()}</strong>
          <label>CONVERSION</label>
          <pre>{JSON.stringify(verification, null, 2)}</pre>
          <button className="primary-button" disabled={!overridePoint} onClick={() => setOverridePoint(null)}>RESET TO AUTOMATIC</button>
        </section>
        <section className="editor-radar"><RadarPicker mapId={mapId} layerId={layerId} value={point} onChange={setOverridePoint} /></section>
        <section className="editor-preview">
          {imageUrl ? <img src={imageUrl} alt="Real captured question preview" /> : <div className="content-empty-state"><strong>NO CAPTURE LOADED</strong><span>Open the verification URL printed by question:import.</span></div>}
        </section>
      </div>
    </main>
  );
}
