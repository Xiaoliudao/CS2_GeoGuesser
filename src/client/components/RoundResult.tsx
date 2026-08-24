import { getMap } from "../../shared/maps";
import type { GameRoomState } from "../../shared/types";
import { RoundRadarResult } from "./RoundRadarResult";

export function RoundResult({ room, playerId }: { room: GameRoomState; playerId: string }) {
  const result = room.roundResult;
  const question = room.currentQuestion;
  if (!result || !question) return null;

  return (
    <section className="round-result-page">
      <header className="result-page-heading">
        <div><span>ROUND {room.round} COMPLETE</span><h2>POSITION REVEALED</h2></div>
        <p>{room.round === room.totalRounds ? "FINAL RESULT INCOMING" : "NEXT ROUND IN A MOMENT"}</p>
      </header>
      <div className="round-result-layout">
        <RoundRadarResult result={result} playerId={playerId} />
        <div className="result-question-image"><img src={question.imageUrl} alt="Round location screenshot" /></div>
      </div>
      <div className="result-grid v2-result-grid">
        {result.players.map((player) => {
          const guessedMap = player.mapGuess ? getMap(player.mapGuess).name : "No guess";
          const distance = player.distance === null ? null : `${(player.distance * 100).toFixed(1)}%`;
          const layer = player.layerGuess?.toUpperCase() ?? "—";
          return (
            <article className={player.playerId === playerId ? "is-me" : ""} key={player.playerId}>
              <header><strong>{player.nickname}</strong>{player.playerId === playerId && <small>YOU</small>}</header>
              <dl>
                <div><dt>MAP</dt><dd className={player.mapCorrect ? "correct" : "wrong"}>{guessedMap} {player.mapCorrect ? "✓" : "×"}</dd></div>
                <div><dt>LAYER</dt><dd>{layer}</dd></div>
                <div><dt>DISTANCE</dt><dd>{distance ?? (player.submitted ? "WRONG MAP" : "—")}</dd></div>
                <div><dt>LOCATION SCORE</dt><dd>+{player.locationScore}</dd></div>
                <div><dt>TIME</dt><dd>{player.elapsedMs === null ? "—" : `${(player.elapsedMs / 1000).toFixed(1)}s`}</dd></div>
              </dl>
              <b className="round-points">+{player.points}</b>
            </article>
          );
        })}
      </div>
    </section>
  );
}
