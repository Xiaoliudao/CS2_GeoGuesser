import type { GameRoomState } from "../../shared/types";
import { formatScore, integerDisplayScore } from "../lib/formatScore";

export function GameResult({
  room,
  playerId,
  onPlayAgain,
  onLeave,
  isLeaving = false,
}: {
  room: GameRoomState;
  playerId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
  isLeaving?: boolean;
}) {
  if (room.failureCode === "NETWORK_ASSET_FAILURE") {
    return (
      <section className="stage-card final-card">
        <div className="stage-kicker">MATCH PAUSED SAFELY</div>
        <h2>NETWORK ASSET FAILURE</h2>
        <p>No player received free points. Start a new attempt when all connections are stable.</p>
        <div className="final-actions">
          <button className="primary-button" onClick={onPlayAgain} disabled={isLeaving}>TRY AGAIN</button>
          <button className="secondary-button" onClick={onLeave} disabled={isLeaving}>
            {isLeaving ? "LEAVING…" : "LEAVE MATCH"}
          </button>
        </div>
      </section>
    );
  }
  const sorted = [...room.players].sort((a, b) => integerDisplayScore(b.score) - integerDisplayScore(a.score)
    || a.slotIndex - b.slotIndex);
  const topScore = sorted[0] ? integerDisplayScore(sorted[0].score) : null;
  const winners = topScore === null
    ? []
    : sorted.filter((player) => integerDisplayScore(player.score) === topScore);
  const winnerIds = new Set(winners.map((player) => player.id));
  const tied = winners.length > 1;
  const viewerWon = winnerIds.has(playerId);
  const winnerNames = winners.map((player) => player.nickname).join(" · ");
  const fullyCompleted = room.round >= room.settings.totalRounds;
  return (
    <section className="stage-card final-card">
      <div className="stage-kicker">MATCH COMPLETE</div>
      <h2>FINAL RESULT</h2>
      <div className="winner-block">
        <span>{tied ? `${winners.length}-WAY DRAW` : viewerWon ? "VICTORY" : "WINNER"}</span>
        <strong>{winnerNames || "NO RESULT"}</strong>
        {tied && <small>{viewerWon ? "YOU SHARE THE WIN" : "TOP SCORES ARE TIED"}</small>}
      </div>
      <div className="final-scores">
        {sorted.map((player, index) => {
          const score = integerDisplayScore(player.score);
          const previousScore = index > 0 ? integerDisplayScore(sorted[index - 1].score) : null;
          const rank = previousScore === score
            ? sorted.findIndex((candidate) => integerDisplayScore(candidate.score) === score) + 1
            : index + 1;
          return (
          <div key={player.id} className={`${winnerIds.has(player.id) ? "winner" : ""} ${player.id === playerId ? "is-me" : ""} ${player.active ? "" : "is-dnf"}`}>
            <span>#{rank}</span>
            <span className={`final-player-seat player-slot-${player.slotIndex + 1}`}>P{player.slotIndex + 1}</span>
            <strong>{player.nickname}{player.id === playerId && <small>YOU</small>}{!player.active && <small>DNF</small>}</strong>
            <b>{formatScore(player.score)}</b>
          </div>
          );
        })}
      </div>
      <div className="final-actions">
        <button className="primary-button" onClick={onPlayAgain} disabled={isLeaving}>PLAY AGAIN</button>
        <button className="secondary-button" onClick={onLeave} disabled={isLeaving}>
          {isLeaving ? "LEAVING…" : fullyCompleted ? "BACK TO HOME" : "LEAVE MATCH"}
        </button>
      </div>
    </section>
  );
}
