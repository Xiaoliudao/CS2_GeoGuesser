import { useEffect, useState } from "react";
import type { MapId, RadarLayerId } from "../../shared/maps";
import type { SoloSessionState } from "../../shared/solo";
import type { MapPoint } from "../../shared/types";
import { useAuthoritativeCountdown } from "../hooks/useAuthoritativeCountdown";
import { isImagePreloaded } from "../lib/preloadImage";
import { formatScore } from "../lib/formatScore";
import type { SoloActionName } from "../hooks/useSoloSession";
import { SoloGuessPanel } from "./SoloGuessPanel";

export function SoloGameScreen({
  session,
  busyAction,
  serverClockOffsetMs,
  clockSynchronized,
  onHint,
  onSubmit,
  onRefresh,
}: {
  session: SoloSessionState;
  busyAction: SoloActionName | null;
  serverClockOffsetMs: number;
  clockSynchronized: boolean;
  onHint: () => Promise<unknown>;
  onSubmit: (guess: { mapId: MapId; layerId: RadarLayerId; point: MapPoint }) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
}) {
  const question = session.currentQuestion;
  const [imageLoaded, setImageLoaded] = useState(() => question ? isImagePreloaded(question.imageUrl) : false);
  const remainingMs = useAuthoritativeCountdown({
    status: session.status,
    roundEndsAt: session.roundEndsAt,
    serverClockOffsetMs,
    clockSynchronized,
  });
  const expired = remainingMs !== null && remainingMs <= 0;

  useEffect(() => setImageLoaded(question ? isImagePreloaded(question.imageUrl) : false), [question?.imageUrl]);
  useEffect(() => {
    if (!expired) return;
    let cancelled = false;
    let timer: number | null = null;
    const reconcile = async () => {
      await onRefresh();
      if (!cancelled) timer = window.setTimeout(() => void reconcile(), 1_000);
    };
    void reconcile();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [expired, onRefresh, question?.questionId]);

  if (!question) return null;
  return (
    <section className="game-layout-v2 solo-game-layout">
      <SoloGuessPanel
        questionId={question.questionId}
        mapPool={session.settings.mapPool}
        assetOrigin={session.assetOrigin}
        hintMapId={session.hintMapId}
        expired={expired}
        busy={busyAction === "hint" || busyAction === "guess"}
        onHint={onHint}
        onSubmit={onSubmit}
      />

      <section className="question-workspace">
        <div className="question-frame-v2">
          {!imageLoaded && <div className="image-skeleton"><span>LOADING INTEL…</span></div>}
          <img src={question.imageUrl} alt="Location screenshot to identify" onLoad={() => setImageLoaded(true)} style={{ opacity: imageLoaded ? 1 : 0 }} />
          <div className="scanline" />
        </div>
        <div className="round-console">
          <div><span>ROUND</span><strong>{session.round} <i>/ {session.settings.totalRounds}</i></strong></div>
          <div className={remainingMs !== null && remainingMs <= 5_000 ? "urgent" : ""}>
            <span>TIME LEFT</span>
            {remainingMs === null
              ? <strong className="open">SYNCING…</strong>
              : expired
                ? <strong className="locked">REVEALING…</strong>
                : <strong>{(remainingMs / 1000).toFixed(1)}<i>s</i></strong>}
          </div>
          <div><span>SESSION SCORE</span><strong className="solo-score">{formatScore(session.totalScore)}</strong></div>
        </div>
      </section>
    </section>
  );
}
