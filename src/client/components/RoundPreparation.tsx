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
  const ownReady = Boolean(me?.assetReady) || loadState === "ready";
  const activePlayers = room.players
    .filter((player) => player.active)
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const playerIsReady = (candidateId: string, assetReady: boolean) => candidateId === playerId
    ? ownReady
    : assetReady;
  const readyCount = activePlayers.filter((player) => playerIsReady(player.id, player.assetReady)).length;
  const allReady = activePlayers.length > 0 && readyCount === activePlayers.length;

  return (
    <section className="stage-card round-preparation" aria-live="polite">
      <div className="stage-kicker">ROUND {room.round} · PREPARING</div>
      <h2>{allReady ? "ROUND STARTING…" : "LOADING ROUND"}</h2>
      <p>The guessing timer starts only after every active player has loaded the round image.</p>
      <div className="prepare-readiness-summary">
        <span>PLAYER ASSETS</span>
        <strong>{readyCount} / {activePlayers.length} READY</strong>
      </div>
      <div className="prepare-status-list" aria-label="Player asset readiness">
        {activePlayers.map((player) => {
          const isMe = player.id === playerId;
          const ready = playerIsReady(player.id, player.assetReady);
          const localError = isMe && loadState === "error";
          const label = localError
            ? "IMAGE LOAD FAILED"
            : readinessLabel(ready, player.connected ? "LOADING" : "RECONNECTING");
          return (
            <div className={`player-slot-${player.slotIndex + 1}`} key={player.id}>
              <span>
                <i>P{player.slotIndex + 1}</i>
                {player.nickname}
                {isMe && <small>YOU</small>}
                {player.id === room.hostPlayerId && <small>HOST</small>}
              </span>
              <strong className={ready ? "is-ready" : localError ? "is-error" : ""}>{label}</strong>
            </div>
          );
        })}
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
