import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AdminQuestion,
  AdminQuestionListResponse,
  AdminQuestionMutationResponse,
  AdminSession,
} from "../../shared/adminQuestions";
import { parseGetpos, type ParsedGetpos } from "../../content/getpos";
import { getMapOverview } from "../../shared/mapOverviews.generated";
import { getMap, MAPS, type MapId, type RadarLayerId } from "../../shared/maps";
import { selectRadarLayer, traceWorldToRadarPoint } from "../../shared/radarCoordinates";
import type { MapPoint } from "../../shared/types";
import { RadarPicker } from "../components/RadarPicker";

interface AdminApiErrorBody {
  error?: string;
}

type UploadAnswerMode = "manual-radar" | "world-coordinates";

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  let data: (T & AdminApiErrorBody) | null = null;
  try {
    data = await response.json() as T & AdminApiErrorBody;
  } catch {
    // Access normally intercepts before this page loads. Keep a clear fallback
    // for an unexpected HTML/error response from an upstream layer.
  }
  if (!response.ok) throw new Error(data?.error ?? `ADMIN_API_${response.status}`);
  if (!data) throw new Error("ADMIN_API_INVALID_RESPONSE");
  return data;
}

function mutationHeaders(json = false): HeadersInit {
  return {
    "x-cs2-admin-action": "1",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function formatPoint(point: MapPoint): string {
  return `${point.x.toFixed(6)}, ${point.y.toFixed(6)}`;
}

export function AdminQuestionEditorPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draftPoint, setDraftPoint] = useState<MapPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [uploadMapId, setUploadMapId] = useState<MapId>(MAPS[0].id);
  const [uploadLayerId, setUploadLayerId] = useState<RadarLayerId>(MAPS[0].layers[0].id);
  const [uploadPoint, setUploadPoint] = useState<MapPoint | null>(null);
  const [uploadAnswerMode, setUploadAnswerMode] = useState<UploadAnswerMode>("manual-radar");
  const [consoleCoordinates, setConsoleCoordinates] = useState("");
  const [parsedCoordinates, setParsedCoordinates] = useState<ParsedGetpos | null>(null);
  const [coordinateMessage, setCoordinateMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi<AdminSession>("/admin/api/session"),
      adminApi<AdminQuestionListResponse>("/admin/api/questions"),
    ])
      .then(([nextSession, data]) => {
        if (!active) return;
        setSession(nextSession);
        setQuestions(data.questions);
      })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (questions.length === 0) {
      setSelectedId("");
      return;
    }
    if (!questions.some((question) => question.id === selectedId)) setSelectedId(questions[0].id);
  }, [questions, selectedId]);

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadFile]);

  const selected = questions.find((question) => question.id === selectedId);
  const selectedMap = getMap(uploadMapId);
  const uploadLayer = selectedMap.layers.find((layer) => layer.id === uploadLayerId) ?? selectedMap.layers[0];
  const enabledCount = useMemo(() => questions.filter((question) => question.enabled).length, [questions]);

  function replaceQuestion(question: AdminQuestion): void {
    setQuestions((current) => current.map((candidate) => candidate.id === question.id ? question : candidate));
  }

  function resetCoordinatePreview(): void {
    setParsedCoordinates(null);
    setCoordinateMessage("");
    setUploadPoint(null);
  }

  function selectUploadMap(mapId: MapId): void {
    const map = getMap(mapId);
    setUploadMapId(mapId);
    setUploadLayerId(map.layers[0].id);
    resetCoordinatePreview();
  }

  function selectAnswerMode(mode: UploadAnswerMode): void {
    setUploadAnswerMode(mode);
    resetCoordinatePreview();
  }

  function applyConsoleCoordinates(): void {
    try {
      const parsed = parseGetpos(consoleCoordinates);
      const overview = getMapOverview(uploadMapId);
      const layer = selectRadarLayer(parsed.worldPosition, overview);
      const layerDefinition = getMap(uploadMapId).layers.find((candidate) => candidate.id === layer.id);
      if (!layerDefinition) throw new Error("COORDINATE_LAYER_UNAVAILABLE");
      const diagnostic = traceWorldToRadarPoint(parsed.worldPosition, overview, layer);
      const point = diagnostic.final;
      if (import.meta.env.DEV) {
        console.info(JSON.stringify({
          event: "RADAR_COORDINATE_TRACE",
          worldPosition: parsed.worldPosition,
          ...diagnostic,
          css: {
            radarImageTransform: "none",
            radarImageObjectFit: "native aspect ratio (width: 100%; height: auto)",
            markerTransform: "translate(-50%, -50%)",
          },
        }));
      }
      setUploadLayerId(layerDefinition.id);
      setUploadPoint(point);
      setParsedCoordinates(parsed);
      setCoordinateMessage(`COORDINATES APPLIED · ${layerDefinition.name} · ${formatPoint(point)}`);
    } catch {
      setParsedCoordinates(null);
      setUploadPoint(null);
      setCoordinateMessage("INVALID COORDINATES FOR THE SELECTED MAP");
    }
  }

  async function savePoint(): Promise<void> {
    if (!selected || !draftPoint) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await adminApi<AdminQuestionMutationResponse>(
        `/admin/api/questions/${encodeURIComponent(selected.id)}/point`,
        { method: "PATCH", headers: mutationHeaders(true), body: JSON.stringify(draftPoint) },
      );
      replaceQuestion(data.question);
      setDraftPoint(null);
      setMessage("ANSWER POINT SAVED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await adminApi<AdminQuestionMutationResponse>(
        `/admin/api/questions/${encodeURIComponent(selected.id)}/enabled`,
        {
          method: "PATCH",
          headers: mutationHeaders(true),
          body: JSON.stringify({ enabled: !selected.enabled }),
        },
      );
      replaceQuestion(data.question);
      setMessage(data.question.enabled ? "QUESTION ENABLED" : "QUESTION DISABLED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadQuestion(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!uploadFile || !uploadPoint || (uploadAnswerMode === "world-coordinates" && !parsedCoordinates)) return;
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.set("image", uploadFile);
    form.set("mapId", uploadMapId);
    form.set("answerMode", uploadAnswerMode);
    if (uploadAnswerMode === "world-coordinates") {
      form.set("consoleCoordinates", consoleCoordinates);
    } else {
      form.set("layerId", uploadLayer.id);
      form.set("correctX", String(uploadPoint.x));
      form.set("correctY", String(uploadPoint.y));
    }
    form.set("enabled", "true");
    try {
      const data = await adminApi<AdminQuestionMutationResponse>("/admin/api/questions", {
        method: "POST",
        headers: mutationHeaders(),
        body: form,
      });
      setQuestions((current) => [data.question, ...current]);
      setSelectedId(data.question.id);
      setUploadFile(null);
      setUploadPoint(null);
      setParsedCoordinates(null);
      setConsoleCoordinates("");
      setCoordinateMessage("");
      setMessage(`QUESTION ${data.question.id} UPLOADED AND ENABLED`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="editor-page"><div className="content-empty-state editor-empty"><strong>VERIFYING CLOUDFLARE ACCESS</strong><span>Loading the protected D1 question bank.</span></div></main>;
  }
  if (loadError) {
    return <main className="editor-page"><div className="content-empty-state editor-empty"><strong>ADMIN EDITOR UNAVAILABLE</strong><span>{loadError}</span></div></main>;
  }

  const displayedPoint = draftPoint ?? selected?.correctPoint ?? null;
  return (
    <main className="editor-page admin-editor-page">
      <header className="admin-editor-header">
        <div><span>PROTECTED BY CLOUDFLARE ACCESS</span><h1>QUESTION EDITOR</h1><p>Upload real screenshots to R2 and manage the live D1 question bank.</p></div>
        <div className="admin-session"><small>SIGNED IN</small><strong>{session?.email}</strong><a href="/">RETURN TO GAME</a></div>
      </header>

      <section className="admin-summary">
        <div><span>TOTAL QUESTIONS</span><strong>{questions.length}</strong></div>
        <div><span>ENABLED</span><strong>{enabledCount}</strong></div>
        <div><span>DISABLED</span><strong>{questions.length - enabledCount}</strong></div>
      </section>

      <form className="admin-upload" onSubmit={(event) => void uploadQuestion(event)}>
        <header><span>NEW LIVE QUESTION</span><h2>UPLOAD SCREENSHOT</h2><p>Choose a real JPEG, PNG, or WebP (maximum 12 MB), then click the radar or paste CS2 console coordinates.</p></header>
        <fieldset className="admin-answer-mode">
          <legend>ANSWER INPUT</legend>
          <label className={uploadAnswerMode === "manual-radar" ? "is-selected" : ""}>
            <input
              type="radio"
              name="upload-answer-mode"
              checked={uploadAnswerMode === "manual-radar"}
              onChange={() => selectAnswerMode("manual-radar")}
            />
            <span><strong>CLICK RADAR</strong><small>Choose the answer manually.</small></span>
          </label>
          <label className={uploadAnswerMode === "world-coordinates" ? "is-selected" : ""}>
            <input
              type="radio"
              name="upload-answer-mode"
              checked={uploadAnswerMode === "world-coordinates"}
              onChange={() => selectAnswerMode("world-coordinates")}
            />
            <span><strong>PASTE CS2 COORDINATES</strong><small>Convert setpos_exact automatically.</small></span>
          </label>
        </fieldset>
        <div className="admin-upload-fields">
          <label>QUESTION SCREENSHOT<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label>
          <label>MAP<select value={uploadMapId} onChange={(event) => selectUploadMap(event.target.value as MapId)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
          <label>{uploadAnswerMode === "world-coordinates" ? "LAYER (AUTO)" : "LAYER"}<select disabled={uploadAnswerMode === "world-coordinates"} value={uploadLayer.id} onChange={(event) => { setUploadLayerId(event.target.value as RadarLayerId); setUploadPoint(null); }}>{selectedMap.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
          <div className="admin-upload-point"><span>ANSWER POINT</span><strong>{uploadPoint ? formatPoint(uploadPoint) : uploadAnswerMode === "world-coordinates" ? "APPLY COORDINATES" : "CLICK RADAR"}</strong></div>
        </div>
        {uploadAnswerMode === "world-coordinates" && <section className="admin-coordinate-panel">
          <label>CS2 CONSOLE COORDINATES
            <textarea
              value={consoleCoordinates}
              onChange={(event) => {
                setConsoleCoordinates(event.target.value);
                resetCoordinatePreview();
              }}
              placeholder="setpos_exact -2331.545654 -477.949829 -63.248474; setang_exact -13.700989 -145.679047 0.000000"
              rows={3}
              maxLength={2048}
            />
          </label>
          <div className="admin-coordinate-actions">
            <button type="button" className="secondary-button" disabled={busy || consoleCoordinates.trim().length === 0} onClick={applyConsoleCoordinates}>APPLY COORDINATES</button>
            <span className={parsedCoordinates ? "is-valid" : coordinateMessage ? "is-error" : ""}>{coordinateMessage || "Paste setpos_exact; setang_exact from the CS2 console."}</span>
          </div>
          {parsedCoordinates && <pre>{JSON.stringify({
            worldPosition: parsedCoordinates.worldPosition,
            viewAngle: parsedCoordinates.viewAngle ?? null,
            layerId: uploadLayer.id,
            automaticPoint: uploadPoint,
          }, null, 2)}</pre>}
        </section>}
        <div className="admin-upload-workspace">
          <div className="admin-image-preview">{uploadPreviewUrl ? <img src={uploadPreviewUrl} alt="Screenshot selected for upload" /> : <span>SELECT A REAL SCREENSHOT</span>}</div>
          <RadarPicker
            mapId={uploadMapId}
            layerId={uploadLayer.id}
            value={uploadPoint}
            onChange={setUploadPoint}
            disabled={uploadAnswerMode === "world-coordinates"}
            markerLabel={uploadAnswerMode === "world-coordinates" ? "WORLD POSITION" : "ANSWER"}
            markerMode={uploadAnswerMode === "world-coordinates" ? "auto" : "manual"}
          />
        </div>
        <button className="primary-button" type="submit" disabled={busy || !uploadFile || !uploadPoint || (uploadAnswerMode === "world-coordinates" && !parsedCoordinates)}>UPLOAD TO R2 + PUBLISH TO D1</button>
      </form>

      {message && <p className="editor-action-message admin-global-message">{message}</p>}

      {selected ? <div className="editor-layout admin-editor-layout">
        <section className="editor-controls">
          <label htmlFor="admin-question-select">LIVE QUESTION</label>
          <select id="admin-question-select" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setDraftPoint(null); setMessage(""); }}>
            {questions.map((question) => <option key={question.id} value={question.id}>{question.id} · {getMap(question.mapId).name} · {question.enabled ? "ENABLED" : "DISABLED"}</option>)}
          </select>
          <div className={`coordinate-mode ${selected.enabled ? "is-auto" : "is-manual"}`}>{selected.enabled ? "LIVE / ENABLED" : "DISABLED"}</div>
          <label>MAP / LAYER</label><strong>{getMap(selected.mapId).name} · {selected.layerId.toUpperCase()}</strong>
          <div className="point-audit">
            <div><span>SAVED ANSWER</span><code>{formatPoint(selected.correctPoint)}</code></div>
            <div><span>DRAFT ANSWER</span><code>{draftPoint ? formatPoint(draftPoint) : "not changed"}</code></div>
            <div><span>COORDINATE SOURCE</span><code>{selected.coordinateSource}</code></div>
          </div>
          <label>AUDIT</label>
          <pre>{JSON.stringify({ createdAt: selected.createdAt, updatedAt: selected.updatedAt, contentHash: selected.contentHash, worldPosition: selected.worldPosition ?? null, viewAngle: selected.viewAngle ?? null }, null, 2)}</pre>
          <div className="editor-actions">
            <button type="button" className="primary-button" disabled={busy || !draftPoint} onClick={() => void savePoint()}>SAVE ANSWER POINT</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void toggleEnabled()}>{selected.enabled ? "DISABLE QUESTION" : "ENABLE QUESTION"}</button>
          </div>
        </section>
        <section className="editor-radar"><RadarPicker mapId={selected.mapId} layerId={selected.layerId} value={displayedPoint} onChange={setDraftPoint} markerLabel={draftPoint ? "NEW ANSWER" : "SAVED ANSWER"} markerMode={draftPoint ? "manual" : "auto"} /></section>
        <section className="editor-preview"><img src={selected.imageUrl} alt={`Question ${selected.id}`} /></section>
      </div> : <div className="content-empty-state editor-empty"><strong>NO QUESTIONS YET</strong><span>Upload the first real question above.</span></div>}
    </main>
  );
}
