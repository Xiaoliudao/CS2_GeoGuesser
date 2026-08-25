import type { PublicPlayer } from "../../shared/types";
import { formatScore, integerDisplayScore } from "../lib/formatScore";

export function PlayerStrip({ players, playerId }: { players: PublicPlayer[]; playerId: string }) {
  const rankedPlayers = [...players]
    .sort((left, right) => integerDisplayScore(right.score) - integerDisplayScore(left.score)
      || left.slotIndex - right.slotIndex);

  return (
    <div className="player-strip" aria-label="Live scoreboard">
      {rankedPlayers.map((player, index) => {
        const score = integerDisplayScore(player.score);
        const previousScore = index > 0 ? integerDisplayScore(rankedPlayers[index - 1].score) : null;
        const rank = previousScore === score
          ? rankedPlayers.findIndex((candidate) => integerDisplayScore(candidate.score) === score) + 1
          : index + 1;
        return (
        <div className={`score-player player-slot-${player.slotIndex + 1} ${player.id === playerId ? "is-me" : ""} ${player.active ? "" : "is-dnf"}`} key={player.id}>
          <span className="score-rank" aria-label={`Rank ${rank}`}>#{rank}</span>
          <div>
            <span className={`presence ${player.connected ? "online" : ""}`} />
            <span className="player-seat">P{player.slotIndex + 1}</span>
            <strong>{player.nickname}</strong>
            {player.id === playerId && <small>YOU</small>}
          </div>
          <b>{formatScore(player.score)}</b>
          <span className={!player.active ? "dnf" : player.submitted ? "submitted" : "thinking"}>
            {!player.active ? "DNF" : player.submitted ? "SUBMITTED ✓" : "THINKING…"}
          </span>
        </div>
        );
      })}
    </div>
  );
}
