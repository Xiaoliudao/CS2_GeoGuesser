import type { GameRoomState } from "../../shared/types";
import { formatScore, integerDisplayScore } from "../lib/formatScore";

export function GameResult({
  room,
  playerId,
  onPlayAgain,
  onLeave,
}: {
  room: GameRoomState;
  playerId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  if (room.failureCode === "NETWORK_ASSET_FAILURE") {
    return (
      <section className="stage-card final-card">
        <div className="stage-kicker">MATCH PAUSED SAFELY</div>
        <h2>NETWORK ASSET FAILURE</h2>
        <p>No player received free points. Start a new attempt when both connections are stable.</p>
        <div className="final-actions">
          <button className="primary-button" onClick={onPlayAgain}>TRY AGAIN</button>
          <button className="secondary-button" onClick={onLeave}>LEAVE ROOM</button>
        </div>
      </section>
    );
  }
  const sorted = [...room.players].sort((a, b) => integerDisplayScore(b.score) - integerDisplayScore(a.score));
  const tied = sorted.length === 2 && integerDisplayScore(sorted[0].score) === integerDisplayScore(sorted[1].score);
  const winner = sorted[0];
  return (
    <section className="stage-card final-card">
      <div className="stage-kicker">MATCH COMPLETE</div>
      <h2>FINAL RESULT</h2>
      <div className="winner-block">
        <span>{tied ? "DRAW" : winner?.id === playerId ? "VICTORY" : "WINNER"}</span>
        <strong>{tied ? "EVENLY MATCHED" : winner?.nickname}</strong>
      </div>
      <div className="final-scores">
        {sorted.map((player, index) => (
          <div key={player.id} className={index === 0 && !tied ? "winner" : ""}>
            <span>#{index + 1}</span>
            <strong>{player.nickname}{player.id === playerId && <small>YOU</small>}</strong>
            <b>{formatScore(player.score)}</b>
          </div>
        ))}
      </div>
      <div className="final-actions">
        <button className="primary-button" onClick={onPlayAgain}>PLAY AGAIN</button>
        <button className="secondary-button" onClick={onLeave}>LEAVE ROOM</button>
      </div>
    </section>
  );
}
