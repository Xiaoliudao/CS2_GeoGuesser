import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AdminQuestion,
  AdminQuestionListResponse,
  AdminQuestionMutationResponse,
  AdminSession,
} from "../../shared/adminQuestions";
import { getMap, MAPS, type MapId, type RadarLayerId } from "../../shared/maps";
import type { MapPoint } from "../../shared/types";
import { RadarPicker } from "../components/RadarPicker";

interface AdminApiErrorBody {
  error?: string;
}

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
    if (!uploadFile || !uploadPoint) return;
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.set("image", uploadFile);
    form.set("mapId", uploadMapId);
    form.set("layerId", uploadLayer.id);
    form.set("correctX", String(uploadPoint.x));
    form.set("correctY", String(uploadPoint.y));
    form.set("coordinateSource", "manual-override");
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
        <header><span>NEW LIVE QUESTION</span><h2>UPLOAD SCREENSHOT</h2><p>Choose a real JPEG, PNG, or WebP (maximum 12 MB), then click the radar to set the answer.</p></header>
        <div className="admin-upload-fields">
          <label>QUESTION SCREENSHOT<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label>
          <label>MAP<select value={uploadMapId} onChange={(event) => {
            const mapId = event.target.value as MapId;
            const map = getMap(mapId);
            setUploadMapId(mapId);
            setUploadLayerId(map.layers[0].id);
            setUploadPoint(null);
          }}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
          <label>LAYER<select value={uploadLayer.id} onChange={(event) => { setUploadLayerId(event.target.value as RadarLayerId); setUploadPoint(null); }}>{selectedMap.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
          <div className="admin-upload-point"><span>ANSWER POINT</span><strong>{uploadPoint ? formatPoint(uploadPoint) : "CLICK RADAR"}</strong></div>
        </div>
        <div className="admin-upload-workspace">
          <div className="admin-image-preview">{uploadPreviewUrl ? <img src={uploadPreviewUrl} alt="Screenshot selected for upload" /> : <span>SELECT A REAL SCREENSHOT</span>}</div>
          <RadarPicker mapId={uploadMapId} layerId={uploadLayer.id} value={uploadPoint} onChange={setUploadPoint} markerLabel="ANSWER" />
        </div>
        <button className="primary-button" type="submit" disabled={busy || !uploadFile || !uploadPoint}>UPLOAD TO R2 + PUBLISH TO D1</button>
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
