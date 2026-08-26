import { getMap } from "../../shared/maps";
import { LAYER_SCORE, MAP_SCORE, MAX_LOCATION_SCORE, MAX_TIME_BONUS } from "../../shared/scoring";
import type { GameRoomState } from "../../shared/types";
import { formatScore } from "../lib/formatScore";
import { RoundRadarResult } from "./RoundRadarResult";
import { HostKickButton } from "./HostKickButton";

export function RoundResult({
  room,
  playerId,
  onKick,
  kickingPlayerId,
}: {
  room: GameRoomState;
  playerId: string;
  onKick?: (targetPlayerId: string) => void;
  kickingPlayerId?: string | null;
}) {
  const result = room.roundResult;
  const question = room.currentQuestion;
  if (!result || !question) return null;
  const roomPlayers = new Map(room.players.map((player) => [player.id, player]));
  const rankedPlayers = result.players
    .map((player, fallbackIndex) => {
      const roomPlayer = roomPlayers.get(player.playerId);
      return {
        player,
        roomPlayer,
        slotIndex: roomPlayer?.slotIndex ?? fallbackIndex,
        active: roomPlayer?.active ?? true,
        totalScore: roomPlayer?.score ?? player.points,
      };
    })
    .sort((left, right) => right.player.points - left.player.points
      || left.slotIndex - right.slotIndex);

  return (
    <section className="round-result-page">
      <header className="result-page-heading">
        <div><span>ROUND {room.round} COMPLETE</span><h2>POSITION REVEALED</h2></div>
        <p>{room.round === room.settings.totalRounds ? "FINAL RESULT INCOMING" : "NEXT ROUND IN A MOMENT"}</p>
      </header>
      <div className="round-result-layout">
        <RoundRadarResult result={result} playerId={playerId} players={room.players} assetOrigin={room.assetOrigin} />
        <div className="result-question-image"><img src={question.imageUrl} alt="Round location screenshot" /></div>
      </div>
      <div className="round-result-leaderboard" aria-label="Round leaderboard">
        {rankedPlayers.map(({ player, roomPlayer, slotIndex, active, totalScore }, index) => {
          const previous = index > 0 ? rankedPlayers[index - 1].player.points : null;
          const rank = previous === player.points
            ? rankedPlayers.findIndex((entry) => entry.player.points === player.points) + 1
            : index + 1;
          const distance = player.distance === null ? "—" : `${(player.distance * 100).toFixed(1)}%`;
          return (
            <div className={`${player.playerId === playerId ? "is-me" : ""} ${active ? "" : "is-dnf"}`} key={player.playerId}>
              <span className="round-result-rank">#{rank}</span>
              <span className={`round-result-seat player-slot-${slotIndex + 1}`}>P{slotIndex + 1}</span>
              <strong>{player.nickname}{player.playerId === playerId && <small>YOU</small>}</strong>
              <span className="round-result-accuracy">
                {!active ? "DNF · " : ""}MAP {player.mapCorrect ? "✓" : "×"} · LAYER {player.layerCorrect ? "✓" : "×"} · {distance}
              </span>
              <b><em>+{formatScore(player.points)}</em><small>TOTAL {formatScore(totalScore)}</small></b>
              {roomPlayer && onKick && (
                <HostKickButton
                  viewerPlayerId={playerId}
                  hostPlayerId={room.hostPlayerId}
                  target={roomPlayer}
                  status={room.status}
                  isKicking={kickingPlayerId === player.playerId}
                  onKick={onKick}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="round-result-details">
        {rankedPlayers.map(({ player, slotIndex, active }) => {
          const guessedMap = player.mapGuess ? getMap(player.mapGuess).name : "No guess";
          const distance = player.distance === null ? null : `${(player.distance * 100).toFixed(1)}%`;
          const layer = player.layerGuess?.toUpperCase() ?? "—";
          const timeBonus = player.timeBonus ?? 0;
          return (
            <details className={`${player.playerId === playerId ? "is-me" : ""} ${active ? "" : "is-dnf"}`} key={player.playerId} open={player.playerId === playerId}>
              <summary>
                <span className={`round-result-seat player-slot-${slotIndex + 1}`}>P{slotIndex + 1}</span>
                <strong>{player.nickname}</strong>
                {player.playerId === playerId && <small>YOU</small>}
                {!active && <small>DNF</small>}
                <b>+{formatScore(player.points)}</b>
              </summary>
              <dl>
                <div><dt>MAP</dt><dd className={player.mapCorrect ? "correct" : "wrong"}>{guessedMap} {player.mapCorrect ? "✓" : "×"}</dd></div>
                <div><dt>MAP SCORE</dt><dd>+{formatScore(player.mapScore)} / {MAP_SCORE}</dd></div>
                <div><dt>LAYER</dt><dd className={player.layerCorrect ? "correct" : "wrong"}>{layer} {player.layerCorrect ? "✓" : "×"}</dd></div>
                <div><dt>LAYER SCORE</dt><dd>+{formatScore(player.layerScore)} / {LAYER_SCORE}</dd></div>
                <div><dt>DISTANCE</dt><dd>{distance ?? (player.submitted ? "WRONG MAP" : "—")}</dd></div>
                <div><dt>POSITION SCORE</dt><dd>+{formatScore(player.locationScore)} / {MAX_LOCATION_SCORE}</dd></div>
                <div><dt>TIME</dt><dd>{player.elapsedMs === null ? "—" : `${(player.elapsedMs / 1000).toFixed(1)}s`}</dd></div>
                <div><dt>TIME SCORE</dt><dd>+{formatScore(timeBonus)} / {MAX_TIME_BONUS}</dd></div>
              </dl>
            </details>
          );
        })}
      </div>
    </section>
  );
}
