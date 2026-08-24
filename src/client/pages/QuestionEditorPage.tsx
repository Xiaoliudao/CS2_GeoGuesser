import { useMemo, useState } from "react";
import questionManifest from "../../../content/question-manifest.json";
import { getMap, isLayerForMap, type MapId, type RadarLayerId } from "../../shared/maps";
import type { ViewAngle, WorldPosition } from "../../shared/radarCoordinates";
import type { MapPoint } from "../../shared/types";
import { RadarPicker } from "../components/RadarPicker";

interface QaQuestion {
  id: string;
  imageAssetId: string;
  correctMapId: MapId;
  correctLayerId: RadarLayerId;
  correctPoint: MapPoint;
  worldPosition: WorldPosition;
  viewAngle?: ViewAngle;
  coordinateSource: "world-conversion" | "manual-override";
}

const importedQuestions = questionManifest as readonly QaQuestion[];

function finitePoint(params: URLSearchParams): MapPoint | null {
  const x = Number(params.get("x"));
  const y = Number(params.get("y"));
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export function QuestionEditorPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialQuestionId = params.get("question") ?? importedQuestions[0]?.id ?? "";
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialQuestionId);
  const selectedQuestion = importedQuestions.find((question) => question.id === selectedQuestionId);
  const requestedMap = params.get("map") as MapId | null;
  const fallbackMap: MapId = requestedMap && ["mirage", "inferno", "ancient", "nuke", "anubis", "dust2", "train", "overpass"].includes(requestedMap)
    ? requestedMap
    : "mirage";
  const mapId = selectedQuestion?.correctMapId ?? fallbackMap;
  const requestedLayer = params.get("layer") ?? getMap(mapId).layers[0].id;
  const fallbackLayer: RadarLayerId = isLayerForMap(mapId, requestedLayer) ? requestedLayer : getMap(mapId).layers[0].id;
  const layerId = selectedQuestion?.correctLayerId ?? fallbackLayer;
  const automaticPoint = selectedQuestion?.correctPoint ?? finitePoint(params);
  const [overridePoint, setOverridePoint] = useState<MapPoint | null>(null);
  const point = overridePoint ?? automaticPoint;
  const imageUrl = selectedQuestion ? `/media/questions/${selectedQuestion.imageAssetId}` : params.get("image") ?? "";
  const verification = {
    questionId: selectedQuestion?.id ?? "query-preview",
    correctMapId: mapId,
    correctLayerId: layerId,
    automaticPoint,
    manualOverride: overridePoint,
    worldPosition: selectedQuestion?.worldPosition ?? params.get("world") ?? "not provided",
    viewAngle: selectedQuestion?.viewAngle ?? "not provided",
    coordinateSource: overridePoint ? "manual-override" : selectedQuestion?.coordinateSource ?? "world-conversion",
  };

  return (
    <main className="editor-page">
      <header><span>DEVELOPMENT QA TOOL</span><h1>QUESTION VERIFICATION</h1><p>Compare each real screenshot with its synchronized radar, automatic point, source coordinates, and view angle.</p></header>
      <div className="editor-layout">
        <section className="editor-controls">
          <label htmlFor="question-select">IMPORTED QUESTION</label>
          <select
            id="question-select"
            value={selectedQuestionId}
            onChange={(event) => { setSelectedQuestionId(event.target.value); setOverridePoint(null); }}
            disabled={importedQuestions.length === 0}
          >
            {importedQuestions.length === 0
              ? <option value="">NO IMPORTED QUESTIONS</option>
              : importedQuestions.map((question) => <option key={question.id} value={question.id}>{question.id} · {question.correctMapId}</option>)}
          </select>
          <label>MAP / LAYER</label>
          <strong>{getMap(mapId).name} · {layerId.toUpperCase()}</strong>
          <label>CONVERSION</label>
          <pre>{JSON.stringify(verification, null, 2)}</pre>
          <button className="primary-button" disabled={!overridePoint} onClick={() => setOverridePoint(null)}>RESET TO AUTOMATIC</button>
        </section>
        <section className="editor-radar"><RadarPicker mapId={mapId} layerId={layerId} value={point} onChange={setOverridePoint} /></section>
        <section className="editor-preview">
          {imageUrl ? <img src={imageUrl} alt="Real captured question preview" /> : <div className="content-empty-state"><strong>NO CAPTURE LOADED</strong><span>Import a question or open the verification URL printed by the importer.</span></div>}
        </section>
      </div>
    </main>
  );
}
