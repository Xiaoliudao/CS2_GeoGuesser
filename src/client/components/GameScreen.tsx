import { useEffect, useState } from "react";
import type { ClientEvent } from "../../shared/protocol";
import type { GameRoomState } from "../../shared/types";
import { GuessPanel } from "./GuessPanel";
import { PlayerStrip } from "./PlayerStrip";
import { isImagePreloaded } from "../lib/preloadImage";
import { useAuthoritativeCountdown } from "../hooks/useAuthoritativeCountdown";

export function GameScreen({
  room,
  playerId,
  serverClockOffsetMs,
  clockSynchronized,
  onSend,
}: {
  room: GameRoomState;
  playerId: string;
  serverClockOffsetMs: number;
  clockSynchronized: boolean;
  onSend: (event: ClientEvent) => boolean;
}) {
  const [imageLoaded, setImageLoaded] = useState(() => room.currentQuestion ? isImagePreloaded(room.currentQuestion.imageUrl) : false);
  const remainingMs = useAuthoritativeCountdown({
    status: room.status,
    roundEndsAt: room.roundEndsAt,
    serverClockOffsetMs,
    clockSynchronized,
  });
  const me = room.players.find((player) => player.id === playerId);
  const submitted = Boolean(me?.submitted);
  const expired = remainingMs !== null && remainingMs <= 0;
  const question = room.currentQuestion;

  useEffect(() => setImageLoaded(question ? isImagePreloaded(question.imageUrl) : false), [question?.imageUrl]);
  if (!question) return null;

  return (
    <section className="game-layout-v2">
      <GuessPanel
        questionId={question.questionId}
        round={room.round}
        mapPool={room.settings.mapPool}
        assetOrigin={room.assetOrigin}
        submitted={submitted}
        expired={expired}
        onSend={onSend}
      />

      <section className="question-workspace">
        <div className="question-frame-v2">
          {!imageLoaded && <div className="image-skeleton"><span>LOADING INTEL…</span></div>}
          <img
            src={question.imageUrl}
            alt="Location screenshot to identify"
            onLoad={() => setImageLoaded(true)}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
          <div className="scanline" />
        </div>
        <div className="round-console">
          <div><span>ROUND</span><strong>{room.round} <i>/ {room.settings.totalRounds}</i></strong></div>
          <div className={remainingMs !== null && remainingMs <= 5_000 ? "urgent" : ""}>
            <span>TIME LEFT</span>
            {remainingMs === null
              ? <strong className="open">SYNCING…</strong>
              : expired
                ? <strong className="locked">WAITING FOR RESULT…</strong>
                : <strong>{(remainingMs / 1000).toFixed(1)}<i>s</i></strong>}
          </div>
          <div><span>STATUS</span><strong className={submitted ? "locked" : "open"}>{submitted ? "LOCKED IN ✓" : "SELECTING…"}</strong></div>
        </div>
      </section>

      <div className="game-score-row"><PlayerStrip players={room.players} playerId={playerId} /></div>
    </section>
  );
}
