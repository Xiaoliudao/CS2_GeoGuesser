import type { GameRoomState } from "../../shared/types";
import type { RoundAssetLoadState } from "../hooks/useRoundPreparation";

function readinessLabel(ready: boolean, loadingLabel = "LOADING"): string {
  return ready ? "READY ✓" : loadingLabel;
}

export function RoundPreparation({
  room,
  playerId,
  loadState,
  errorReason,
  onRetry,
}: {
  room: GameRoomState;
  playerId: string;
  loadState: RoundAssetLoadState;
  errorReason: string | null;
  onRetry: () => void;
}) {
  const me = room.players.find((player) => player.id === playerId);
  const opponent = room.players.find((player) => player.id !== playerId);
  const ownReady = Boolean(me?.assetReady) || loadState === "ready";
  const bothReady = room.players.length === 2 && room.players.every((player) => player.assetReady);

  return (
    <section className="stage-card round-preparation" aria-live="polite">
      <div className="stage-kicker">ROUND {room.round} · PREPARING</div>
      <h2>{bothReady ? "ROUND STARTING…" : "LOADING ROUND"}</h2>
      <p>The guessing timer will start only after both players have loaded the required assets.</p>
      <div className="prepare-status-list">
        <div>
          <span>QUESTION IMAGE</span>
          <strong className={ownReady ? "is-ready" : loadState === "error" ? "is-error" : ""}>
            {loadState === "error" ? "IMAGE LOAD FAILED" : readinessLabel(ownReady)}
          </strong>
        </div>
        <div>
          <span>YOU</span>
          <strong className={ownReady ? "is-ready" : ""}>{readinessLabel(ownReady)}</strong>
        </div>
        <div>
          <span>OPPONENT</span>
          <strong className={opponent?.assetReady ? "is-ready" : ""}>
            {readinessLabel(Boolean(opponent?.assetReady), opponent?.connected === false ? "RECONNECTING" : "LOADING")}
          </strong>
        </div>
      </div>
      {loadState === "error" && (
        <div className="prepare-error">
          <span>{errorReason ?? "NETWORK"}</span>
          <button type="button" className="secondary-button" onClick={onRetry}>RETRY</button>
        </div>
      )}
      <small>Attempt {room.assetPrepareAttempt + 1} of 3 · No guessing time has elapsed.</small>
    </section>
  );
}
