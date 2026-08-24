import type { PublicPlayer } from "../../shared/types";

export function PlayerStrip({ players, playerId }: { players: PublicPlayer[]; playerId: string }) {
  return (
    <div className="player-strip">
      {players.map((player) => (
        <div className="score-player" key={player.id}>
          <div>
            <span className={`presence ${player.connected ? "online" : ""}`} />
            <strong>{player.nickname}</strong>
            {player.id === playerId && <small>YOU</small>}
          </div>
          <b>{player.score.toLocaleString()}</b>
          <span className={player.submitted ? "submitted" : "thinking"}>
            {player.submitted ? "SUBMITTED ✓" : "THINKING…"}
          </span>
        </div>
      ))}
    </div>
  );
}
