import type { GameRoomState } from "../../shared/types";

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
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const tied = sorted.length === 2 && sorted[0].score === sorted[1].score;
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
            <b>{player.score.toLocaleString()}</b>
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
