import type { SoloSessionState } from "../../shared/solo";
import type { SoloAssetLoadState } from "../hooks/useSoloRoundPreparation";

export function SoloRoundPreparation({
  session,
  loadState,
  errorReason,
  onRetry,
}: {
  session: SoloSessionState;
  loadState: SoloAssetLoadState;
  errorReason: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="stage-card round-preparation solo-preparation" aria-live="polite">
      <div className="stage-kicker">ROUND {session.round} · PREPARING</div>
      <h2>{loadState === "ready" ? "ROUND STARTING…" : "LOADING ROUND"}</h2>
      <p>The timer starts only after the screenshot and gameplay radar assets are ready on this device.</p>
      <div className="prepare-status-list">
        <div>
          <span>QUESTION IMAGE + RADARS</span>
          <strong className={loadState === "ready" ? "is-ready" : loadState === "error" ? "is-error" : ""}>
            {loadState === "ready" ? "READY ✓" : loadState === "error" ? "LOAD FAILED" : "LOADING"}
          </strong>
        </div>
        <div>
          <span>GUESSING TIMER</span>
          <strong>{loadState === "ready" ? "STARTING" : "NOT STARTED"}</strong>
        </div>
      </div>
      {loadState === "error" && (
        <div className="prepare-error">
          <span>{errorReason ?? "NETWORK"}</span>
          <button type="button" className="secondary-button" onClick={onRetry}>RETRY</button>
        </div>
      )}
      <small>No guessing time is consumed while these files load.</small>
    </section>
  );
}
