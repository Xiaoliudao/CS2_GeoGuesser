import { useEffect, useMemo, useState } from "react";
import { MAP_IDS, type MapId } from "../../shared/maps";
import type { QuestionAvailability } from "../../shared/roomSettings";
import { nicknameSchema } from "../../shared/schemas";
import { DEFAULT_SOLO_SETTINGS, SoloSettingsSchema, type SoloSettings } from "../../shared/solo";
import { navigate } from "../App";
import { SoloGameResult } from "../components/SoloGameResult";
import { SoloGameScreen } from "../components/SoloGameScreen";
import { SoloRoundPreparation } from "../components/SoloRoundPreparation";
import { SoloRoundResult } from "../components/SoloRoundResult";
import { SoloSettingsPanel } from "../components/SoloSettingsPanel";
import { useSoloRoundPreparation } from "../hooks/useSoloRoundPreparation";
import { useSoloSession } from "../hooks/useSoloSession";
import { getNickname } from "../lib/identity";

function SoloSetup({
  nickname,
  busy,
  onStart,
}: {
  nickname: string;
  busy: boolean;
  onStart: (settings: SoloSettings) => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [roundsInput, setRoundsInput] = useState(String(DEFAULT_SOLO_SETTINGS.totalRounds));
  const [durationInput, setDurationInput] = useState(String(DEFAULT_SOLO_SETTINGS.roundDurationSeconds));
  const [mapPool, setMapPool] = useState<MapId[]>([...DEFAULT_SOLO_SETTINGS.mapPool]);
  const [availability, setAvailability] = useState<QuestionAvailability | null>(null);
  const [availabilityKey, setAvailabilityKey] = useState("");
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const settingsResult = useMemo(() => SoloSettingsSchema.safeParse({
    totalRounds: Number(roundsInput),
    roundDurationSeconds: Number(durationInput),
    mapPool,
  }), [durationInput, mapPool, roundsInput]);
  const mapPoolKey = mapPool.join(",");
  const currentAvailability = availabilityKey === mapPoolKey ? availability : null;
  const canStart = settingsResult.success
    && !checkingAvailability
    && currentAvailability !== null
    && settingsResult.data.totalRounds <= currentAvailability.availableQuestions;

  useEffect(() => {
    if (mapPool.length === 0) {
      setAvailability(null);
      setAvailabilityKey("");
      setAvailabilityError("");
      setCheckingAvailability(false);
      return;
    }
    const controller = new AbortController();
    setAvailability(null);
    setAvailabilityError("");
    setCheckingAvailability(true);
    void fetch("/api/questions/availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mapPool }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Question bank unavailable");
      const next = await response.json() as QuestionAvailability;
      if (!controller.signal.aborted) {
        setAvailability(next);
        setAvailabilityKey(mapPool.join(","));
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setAvailabilityError(error instanceof Error ? error.message : "Question bank unavailable");
    }).finally(() => {
      if (!controller.signal.aborted) setCheckingAvailability(false);
    });
    return () => controller.abort();
  }, [mapPool]);

  return (
    <section className="stage-card solo-setup-card">
      <div className="stage-kicker">SINGLE PLAYER</div>
      <h1>START A SOLO SESSION</h1>
      <p>Play immediately at your own pace. The same server-authoritative questions, radar precision, and scoring apply.</p>
      <div className="solo-player-identity"><span>PLAYER</span><strong>{nickname}</strong></div>
      <SoloSettingsPanel
        expanded={expanded}
        roundsInput={roundsInput}
        durationInput={durationInput}
        mapPool={mapPool}
        availability={currentAvailability}
        checkingAvailability={checkingAvailability || availabilityKey !== mapPoolKey}
        availabilityError={availabilityError}
        onToggle={() => setExpanded((current) => !current)}
        onRoundsChange={setRoundsInput}
        onDurationChange={setDurationInput}
        onMapPoolChange={(next) => setMapPool(MAP_IDS.filter((mapId) => next.includes(mapId)))}
      />
      <button
        className="primary-button solo-start-button"
        type="button"
        disabled={busy}
        aria-disabled={busy || !canStart}
        onClick={() => {
          if (!settingsResult.success || !canStart) {
            setExpanded(true);
            return;
          }
          void onStart(settingsResult.data);
        }}
      >
        {busy ? "PREPARING SESSION…" : "START SINGLE PLAYER"}
      </button>
    </section>
  );
}

export function SoloPage() {
  const nickname = useMemo(getNickname, []);
  const solo = useSoloSession();
  const preparation = useSoloRoundPreparation(solo.state, solo.ready);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  useEffect(() => {
    if (!nicknameSchema.safeParse(nickname).success) navigate("/");
  }, [nickname]);

  if (!nicknameSchema.safeParse(nickname).success) return null;
  const leave = () => {
    solo.discard();
    navigate("/");
  };

  return (
    <main className="room-shell solo-shell">
      <header className="room-header solo-header">
        <button className="wordmark" type="button" onClick={() => solo.state ? setConfirmingLeave(true) : navigate("/")}>CS2 <span>MG</span></button>
        <div className="solo-header-status">
          <span>SINGLE PLAYER</span>
          <strong>{solo.state ? `ROUND ${solo.state.round} / ${solo.state.settings.totalRounds}` : "SOLO SETUP"}</strong>
        </div>
        <button className="solo-leave-button" type="button" onClick={() => solo.state ? setConfirmingLeave(true) : navigate("/")}>
          {solo.state ? "LEAVE GAME" : "BACK HOME"}
        </button>
      </header>

      {solo.error && (
        <div className="error-banner" role="alert">
          <span>{solo.error.message}</span>
          <button type="button" aria-label="Dismiss error" onClick={solo.clearError}>×</button>
        </div>
      )}

      {confirmingLeave && (
        <section className="solo-leave-confirm" role="alertdialog" aria-modal="true" aria-labelledby="solo-leave-title">
          <strong id="solo-leave-title">LEAVE THIS SINGLE-PLAYER SESSION?</strong>
          <span>Your active run will no longer be restored on this device.</span>
          <div>
            <button type="button" onClick={() => setConfirmingLeave(false)}>CANCEL</button>
            <button className="is-danger" type="button" onClick={leave}>LEAVE GAME</button>
          </div>
        </section>
      )}

      {solo.restoring && !solo.state && (
        <section className="loading-room">
          <div className="spinner" />
          <h2>RESTORING SESSION</h2>
          <p>Syncing the authoritative solo round…</p>
        </section>
      )}

      {!solo.restoring && !solo.state && (
        <SoloSetup nickname={nickname} busy={solo.busyAction === "start"} onStart={(settings) => solo.start(nickname, settings)} />
      )}

      {solo.state?.status === "round_preparing" && (
        <SoloRoundPreparation session={solo.state} loadState={preparation.loadState} errorReason={preparation.errorReason} onRetry={preparation.retry} />
      )}

      {solo.state?.status === "playing" && (
        <SoloGameScreen
          session={solo.state}
          busyAction={solo.busyAction}
          serverClockOffsetMs={solo.serverClockOffsetMs}
          clockSynchronized={solo.clockSynchronized}
          onHint={() => solo.requestHint(solo.state!.round)}
          onSubmit={(guess) => solo.submitGuess({ round: solo.state!.round, ...guess })}
          onRefresh={solo.refresh}
        />
      )}

      {solo.state?.status === "round_result" && (
        <SoloRoundResult session={solo.state} busy={solo.busyAction === "next"} onNext={() => void solo.nextRound(solo.state!.round)} />
      )}

      {solo.state?.status === "finished" && (
        <SoloGameResult
          session={solo.state}
          busy={solo.busyAction === "play-again"}
          onPlayAgain={() => void solo.playAgain()}
          onHome={leave}
        />
      )}
    </main>
  );
}
