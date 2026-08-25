import { useEffect, useMemo, useState } from "react";
import { getFinalQuestionPoint, type QaPreviewQuestion, type PreviewQuestionStatus } from "../../content/questionPreview";
import { getMap, type MapId, type RadarLayerId } from "../../shared/maps";
import type { ViewAngle, WorldPosition } from "../../shared/radarCoordinates";
import type { MapPoint } from "../../shared/types";
import { RadarPicker } from "../components/RadarPicker";

interface PublishedQaQuestion {
  id: string;
  map_id: MapId;
  layer_id: RadarLayerId;
  correct_x: number;
  correct_y: number;
  automatic_x: number | null;
  automatic_y: number | null;
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  view_pitch: number | null;
  view_yaw: number | null;
  view_roll: number | null;
  coordinate_source: "world-conversion" | "manual-override";
  enabled: number;
}

interface QaQuestion {
  key: string;
  id: string;
  kind: "preview" | "imported";
  mapId: MapId;
  layerId: RadarLayerId;
  automaticPoint: MapPoint;
  manualOverride?: MapPoint;
  finalPoint: MapPoint;
  worldPosition: WorldPosition;
  viewAngle?: ViewAngle;
  coordinateSource: "world-conversion" | "manual-override";
  screenshotUrl: string;
  radarUrl?: string;
  status: PreviewQuestionStatus;
}

function publishedQaQuestion(question: PublishedQaQuestion): QaQuestion {
  const automaticPoint = question.automatic_x !== null && question.automatic_y !== null
    ? { x: question.automatic_x, y: question.automatic_y }
    : { x: question.correct_x, y: question.correct_y };
  const finalPoint = { x: question.correct_x, y: question.correct_y };
  return {
  key: `published:${question.id}`,
  id: question.id,
  kind: "imported",
  mapId: question.map_id,
  layerId: question.layer_id,
  automaticPoint,
  ...(question.coordinate_source === "manual-override" ? { manualOverride: finalPoint } : {}),
  finalPoint,
  worldPosition: { x: question.world_x ?? 0, y: question.world_y ?? 0, z: question.world_z ?? 0 },
  ...(question.view_pitch !== null && question.view_yaw !== null
    ? { viewAngle: { pitch: question.view_pitch, yaw: question.view_yaw, roll: question.view_roll ?? 0 } }
    : {}),
  coordinateSource: question.coordinate_source,
  screenshotUrl: `/media/questions/${question.id}`,
  status: "published",
  };
}

function previewQaQuestion(question: QaPreviewQuestion): QaQuestion {
  return {
    key: `preview:${question.previewId}`,
    id: question.previewId,
    kind: "preview",
    mapId: question.mapId,
    layerId: question.layerId,
    automaticPoint: question.automaticPoint,
    manualOverride: question.manualOverride,
    finalPoint: question.finalPoint,
    worldPosition: question.worldPosition,
    viewAngle: question.viewAngle,
    coordinateSource: question.manualOverride ? "manual-override" : "world-conversion",
    screenshotUrl: question.screenshotUrl,
    radarUrl: question.radarUrl,
    status: question.status,
  };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "x-cs2-dev-action": "1", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `DEV_API_${response.status}`);
  return data;
}

async function loadPreviewQuestions(): Promise<QaQuestion[]> {
  const data = await apiRequest<{ questions: QaPreviewQuestion[]; published: PublishedQaQuestion[] }>("/__dev_api__/questions");
  return [...data.questions.map(previewQaQuestion), ...data.published.map(publishedQaQuestion)];
}

function samePoint(first: MapPoint | undefined, second: MapPoint | undefined): boolean {
  return Boolean(first && second && first.x === second.x && first.y === second.y);
}

export function QuestionEditorPage() {
  const [previewQuestions, setPreviewQuestions] = useState<QaQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [draftPoint, setDraftPoint] = useState<MapPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const availableQuestions = useMemo(() => previewQuestions, [previewQuestions]);

  useEffect(() => {
    let active = true;
    loadPreviewQuestions()
      .then((questions) => { if (active) setPreviewQuestions(questions); })
      .catch(() => { if (active) setPreviewQuestions([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (availableQuestions.length === 0) {
      setSelectedKey("");
      return;
    }
    if (!availableQuestions.some((question) => question.key === selectedKey)) {
      const requestedId = new URLSearchParams(window.location.search).get("question");
      setSelectedKey(availableQuestions.find((question) => question.id === requestedId)?.key ?? availableQuestions[0].key);
    }
  }, [availableQuestions, selectedKey]);

  const selectedQuestion = availableQuestions.find((question) => question.key === selectedKey);

  function replacePreview(question: QaPreviewQuestion): void {
    const replacement = previewQaQuestion(question);
    setPreviewQuestions((questions) => questions.map((candidate) => candidate.id === replacement.id ? replacement : candidate));
  }

  async function saveOverride(): Promise<void> {
    if (!selectedQuestion || !draftPoint) return;
    setBusy(true);
    setActionMessage("");
    try {
      const data = await apiRequest<{ question: QaPreviewQuestion }>(`/__dev_api__/questions/${encodeURIComponent(selectedQuestion.id)}/override`, {
        method: "POST",
        body: JSON.stringify({ point: draftPoint }),
      });
      replacePreview(data.question);
      setDraftPoint(null);
      setActionMessage("OVERRIDE SAVED");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function resetToAutomatic(): Promise<void> {
    if (!selectedQuestion) return;
    setBusy(true);
    setActionMessage("");
    try {
      const data = await apiRequest<{ question: QaPreviewQuestion }>(`/__dev_api__/questions/${encodeURIComponent(selectedQuestion.id)}/override`, { method: "DELETE" });
      replacePreview(data.question);
      setDraftPoint(null);
      setActionMessage("RESTORED AUTOMATIC POINT");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function publishQuestion(): Promise<void> {
    if (!selectedQuestion) return;
    setBusy(true);
    setActionMessage("");
    try {
      const data = await apiRequest<{ result: { status: PreviewQuestionStatus; message?: string }; questions: QaPreviewQuestion[] }>(`/__dev_api__/questions/${encodeURIComponent(selectedQuestion.id)}/publish`, { method: "POST" });
      setPreviewQuestions(data.questions.map(previewQaQuestion));
      setActionMessage(data.result.status === "published" ? "QUESTION PUBLISHED" : data.result.message ?? "PUBLISH_PENDING_R2");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  if (loading) return <main className="editor-page"><div className="content-empty-state editor-empty"><strong>LOADING LOCAL PREVIEW</strong><span>Reading the latest dry-run manifest.</span></div></main>;
  if (!selectedQuestion) {
    return <main className="editor-page"><header><span>DEVELOPMENT QA TOOL</span><h1>QUESTION VERIFICATION</h1></header><div className="content-empty-state editor-empty"><strong>NO PREVIEW QUESTIONS</strong><span>Add a real screenshot and matching metadata to content/inbox, then run npm run questions:import-inbox -- --dry-run.</span></div></main>;
  }

  const persistedPoint = getFinalQuestionPoint({ automaticPoint: selectedQuestion.automaticPoint, manualOverride: selectedQuestion.manualOverride });
  const displayedPoint = draftPoint ?? persistedPoint;
  const hasUnsavedOverride = draftPoint !== null && !samePoint(draftPoint, persistedPoint);
  const isManual = draftPoint !== null || selectedQuestion.manualOverride !== undefined;
  const isPublished = selectedQuestion.status === "published";
  const coordinateSource = isManual ? "MANUAL OVERRIDE" : "WORLD CONVERSION";

  return (
    <main className="editor-page">
      <header><span>DEVELOPMENT QA TOOL</span><h1>QUESTION VERIFICATION</h1><p>Approve real local captures, persist manual corrections, and publish only through the development workflow.</p></header>
      <div className="editor-layout">
        <section className="editor-controls">
          <label htmlFor="question-select">{selectedQuestion.kind === "preview" ? "PREVIEW QUESTION" : "IMPORTED QUESTION"}</label>
          <select id="question-select" value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); setDraftPoint(null); setActionMessage(""); }}>
            {availableQuestions.map((question) => <option key={question.key} value={question.key}>{question.id} · {getMap(question.mapId).name} · {question.status.toUpperCase()}</option>)}
          </select>
          <label>MAP / LAYER</label>
          <strong>{getMap(selectedQuestion.mapId).name} · {selectedQuestion.layerId.toUpperCase()}</strong>
          <div className={`coordinate-mode ${isManual ? "is-manual" : "is-auto"}`}>{coordinateSource}</div>
          <div className="point-audit">
            <div><span>AUTOMATIC POINT</span><code>x {selectedQuestion.automaticPoint.x.toFixed(9)}<br />y {selectedQuestion.automaticPoint.y.toFixed(9)}</code></div>
            <div><span>MANUAL OVERRIDE</span><code>{isManual ? `x ${displayedPoint.x.toFixed(9)}\ny ${displayedPoint.y.toFixed(9)}` : "not set"}</code></div>
            <div><span>FINAL ANSWER</span><code>x {displayedPoint.x.toFixed(9)}<br />y {displayedPoint.y.toFixed(9)}</code></div>
          </div>
          <label>WORLD / VIEW</label>
          <pre>{JSON.stringify({ worldPosition: selectedQuestion.worldPosition, viewAngle: selectedQuestion.viewAngle ?? null, coordinateSource }, null, 2)}</pre>
          <div className="editor-actions">
            <button className="secondary-button" disabled={busy || isPublished || !hasUnsavedOverride} onClick={() => void saveOverride()}>SAVE OVERRIDE</button>
            <button className="secondary-button" disabled={busy || isPublished || (!draftPoint && !selectedQuestion.manualOverride)} onClick={() => void resetToAutomatic()}>RESET TO AUTOMATIC</button>
            <button className="primary-button" disabled={busy || isPublished || hasUnsavedOverride} onClick={() => void publishQuestion()}>{selectedQuestion.status === "publish-pending" ? "RETRY PUBLISH" : isPublished ? "PUBLISHED" : "PUBLISH QUESTION"}</button>
          </div>
          {actionMessage && <p className="editor-action-message">{actionMessage}</p>}
        </section>
        <section className="editor-radar">
          <RadarPicker mapId={selectedQuestion.mapId} layerId={selectedQuestion.layerId} value={displayedPoint} onChange={setDraftPoint} disabled={isPublished} radarUrl={selectedQuestion.radarUrl} markerLabel={isManual ? "MANUAL OVERRIDE" : "AUTO"} markerMode={isManual ? "manual" : "auto"} />
        </section>
        <section className="editor-preview"><img src={selectedQuestion.screenshotUrl} alt={`Real captured preview ${selectedQuestion.id}`} /></section>
      </div>
    </main>
  );
}
