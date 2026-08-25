import { getMap } from "../../shared/maps";
import { LAYER_SCORE, MAP_SCORE, MAX_LOCATION_SCORE, MAX_TIME_BONUS } from "../../shared/scoring";
import type { SoloSessionState } from "../../shared/solo";
import { formatScore } from "../lib/formatScore";
import { ResultRadarView, type ResultRadarMarker } from "./RoundRadarResult";

export function SoloRoundResult({
  session,
  busy,
  onNext,
}: {
  session: SoloSessionState;
  busy: boolean;
  onNext: () => void;
}) {
  const result = session.roundResult;
  const question = session.currentQuestion;
  if (!result || !question) return null;
  const player = result.player;
  const markers: ResultRadarMarker[] = player.pointGuess
    && player.mapGuess === result.correctMapId
    && player.layerGuess === result.correctLayerId
    ? [{ key: "you", point: player.pointGuess, className: "your-point", label: "YOU", ariaLabel: "Your guessed point" }]
    : [];
  const guessedMap = player.mapGuess ? getMap(player.mapGuess).name : "No guess";
  const distance = player.distance === null ? null : `${(player.distance * 100).toFixed(1)}%`;
  const isLastRound = session.round >= session.settings.totalRounds;

  return (
    <section className="round-result-page solo-round-result">
      <header className="result-page-heading">
        <div><span>ROUND {session.round} COMPLETE</span><h2>POSITION REVEALED</h2></div>
        {result.hintUsed && <p className="solo-hint-used">HINT USED · MAP REVEALED</p>}
      </header>
      <div className="round-result-layout">
        <ResultRadarView
          correctMapId={result.correctMapId}
          correctLayerId={result.correctLayerId}
          correctPoint={result.correctPoint}
          markers={markers}
          legend={["✓ Correct", "Y You"]}
          assetOrigin={session.assetOrigin}
        />
        <div className="result-question-image"><img src={question.imageUrl} alt="Round location screenshot" /></div>
      </div>
      <div className="result-grid v2-result-grid solo-result-grid">
        <article className="is-me">
          <header><strong>YOUR RESULT</strong>{result.hintUsed && <small>HINT USED</small>}</header>
          <dl>
            <div><dt>MAP</dt><dd className={player.mapCorrect ? "correct" : "wrong"}>{guessedMap} {player.mapCorrect ? "✓" : player.submitted ? "×" : "—"}</dd></div>
            <div><dt>MAP SCORE</dt><dd>+{formatScore(player.mapScore)} / {MAP_SCORE}</dd></div>
            <div><dt>LAYER</dt><dd className={player.layerCorrect ? "correct" : "wrong"}>{player.layerGuess?.toUpperCase() ?? "—"} {player.layerCorrect ? "✓" : player.submitted ? "×" : ""}</dd></div>
            <div><dt>LAYER SCORE</dt><dd>+{formatScore(player.layerScore)} / {LAYER_SCORE}</dd></div>
            <div><dt>DISTANCE</dt><dd>{distance ?? (player.submitted ? "WRONG MAP / LAYER" : "NO GUESS")}</dd></div>
            <div><dt>POSITION SCORE</dt><dd>+{formatScore(player.locationScore)} / {MAX_LOCATION_SCORE}</dd></div>
            <div><dt>TIME</dt><dd>{player.elapsedMs === null ? "—" : `${(player.elapsedMs / 1000).toFixed(1)}s`}</dd></div>
            <div><dt>TIME SCORE</dt><dd>+{formatScore(player.timeBonus ?? 0)} / {MAX_TIME_BONUS}</dd></div>
          </dl>
          <b className="round-points">+{formatScore(player.points)}</b>
        </article>
      </div>
      <div className="solo-next-action">
        <button className="primary-button" type="button" onClick={onNext} disabled={busy}>
          {busy ? "LOADING…" : isLastRound ? "VIEW SESSION RESULTS" : "NEXT ROUND"}
        </button>
      </div>
    </section>
  );
}
