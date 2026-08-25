import type { SoloSessionState } from "../../shared/solo";
import { formatScore } from "../lib/formatScore";

export interface SoloSummary {
  rounds: number;
  mapsCorrect: number;
  hintsUsed: number;
  averageDistance: number | null;
}

export function summarizeSoloResults(session: Pick<SoloSessionState, "results">): SoloSummary {
  const distances = session.results
    .map((result) => result.player.distance)
    .filter((distance): distance is number => distance !== null && Number.isFinite(distance));
  return {
    rounds: session.results.length,
    mapsCorrect: session.results.filter((result) => result.player.mapCorrect).length,
    hintsUsed: session.results.filter((result) => result.hintUsed).length,
    averageDistance: distances.length === 0
      ? null
      : distances.reduce((total, distance) => total + distance, 0) / distances.length,
  };
}

export function SoloGameResult({
  session,
  busy,
  onPlayAgain,
  onHome,
}: {
  session: SoloSessionState;
  busy: boolean;
  onPlayAgain: () => void;
  onHome: () => void;
}) {
  const summary = summarizeSoloResults(session);
  return (
    <section className="stage-card final-card solo-final-card">
      <div className="stage-kicker">SESSION COMPLETE</div>
      <h2>FINAL RESULT</h2>
      <div className="solo-total-score">
        <span>TOTAL SCORE</span>
        <strong>{formatScore(session.totalScore)}</strong>
      </div>
      <div className="solo-summary-grid">
        <div><span>ROUNDS</span><strong>{summary.rounds}</strong></div>
        <div><span>MAPS CORRECT</span><strong>{summary.mapsCorrect} / {summary.rounds}</strong></div>
        <div><span>AVG DISTANCE</span><strong>{summary.averageDistance === null ? "—" : `${(summary.averageDistance * 100).toFixed(1)}%`}</strong></div>
        <div><span>HINTS USED</span><strong>{summary.hintsUsed}</strong></div>
      </div>
      <div className="final-actions">
        <button className="primary-button" type="button" onClick={onPlayAgain} disabled={busy}>{busy ? "PREPARING…" : "PLAY AGAIN"}</button>
        <button className="secondary-button" type="button" onClick={onHome} disabled={busy}>BACK TO HOME</button>
      </div>
    </section>
  );
}
