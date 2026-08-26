import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { nicknameSchema } from "../../shared/schemas";
import { MAP_IDS, type MapId } from "../../shared/maps";
import type { QuestionDifficulty } from "../../shared/questionDifficulty";
import {
  DEFAULT_ROOM_SETTINGS,
  RoomSettingsSchema,
  type CreateRoomRequest,
  type QuestionAvailability,
  type ServerRegion,
} from "../../shared/roomSettings";
import { navigate } from "../App";
import {
  MATCH_SETTINGS_AVAILABILITY_ID,
  MATCH_SETTINGS_DETAILS_ID,
  MATCH_SETTINGS_DIFFICULTY_POOL_ID,
  MATCH_SETTINGS_DURATION_INPUT_ID,
  MATCH_SETTINGS_MAP_POOL_ID,
  MATCH_SETTINGS_ROUNDS_INPUT_ID,
  MATCH_SETTINGS_REGION_ID,
  MatchSettingsPanel,
} from "../components/MatchSettingsPanel";
import { getNickname, getPlayerId, saveNickname } from "../lib/identity";
import { joinRoom as joinExistingRoom } from "../lib/joinRoom";

const CREATE_ROOM_ERROR_MESSAGES: Record<string, string> = {
  INVALID_ROOM_SETTINGS: "The match settings payload is invalid.",
  INVALID_ROUND_COUNT: "Question count must be a whole number from 1 to 50.",
  INVALID_ROUND_DURATION: "Round time must be a whole number from 10 to 120 seconds.",
  EMPTY_MAP_POOL: "Select at least one map.",
  INVALID_MAP_ID: "The map pool contains an invalid or duplicate map.",
  EMPTY_DIFFICULTY_POOL: "Select at least one difficulty.",
  INVALID_DIFFICULTY: "The difficulty pool contains an invalid or duplicate difficulty.",
  INVALID_SERVER_REGION: "The server region selection is invalid.",
};

type HomeFlow = "modes" | "multiplayer" | "join";

function settingsTargetForErrorCode(errorCode: string): string {
  if (errorCode === "INVALID_ROUND_COUNT") return MATCH_SETTINGS_ROUNDS_INPUT_ID;
  if (errorCode === "INVALID_ROUND_DURATION") return MATCH_SETTINGS_DURATION_INPUT_ID;
  if (errorCode === "EMPTY_MAP_POOL" || errorCode === "INVALID_MAP_ID") return MATCH_SETTINGS_MAP_POOL_ID;
  if (errorCode === "EMPTY_DIFFICULTY_POOL" || errorCode === "INVALID_DIFFICULTY") return MATCH_SETTINGS_DIFFICULTY_POOL_ID;
  if (errorCode === "INVALID_SERVER_REGION") return MATCH_SETTINGS_REGION_ID;
  return MATCH_SETTINGS_DETAILS_ID;
}

export function HomePage() {
  const [flow, setFlow] = useState<HomeFlow>("modes");
  const multiplayerHeadingRef = useRef<HTMLHeadingElement>(null);
  const [nickname, setNickname] = useState(getNickname);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [settingsPanelError, setSettingsPanelError] = useState("");
  const [roundsInput, setRoundsInput] = useState(String(DEFAULT_ROOM_SETTINGS.totalRounds));
  const [durationInput, setDurationInput] = useState(String(DEFAULT_ROOM_SETTINGS.roundDurationSeconds));
  const [mapPool, setMapPool] = useState<MapId[]>([...DEFAULT_ROOM_SETTINGS.mapPool]);
  const [difficultyPool, setDifficultyPool] = useState<QuestionDifficulty[]>([...DEFAULT_ROOM_SETTINGS.difficultyPool]);
  const [serverRegion, setServerRegion] = useState<ServerRegion>(DEFAULT_ROOM_SETTINGS.serverRegion);
  const [availability, setAvailability] = useState<QuestionAvailability | null>(null);
  const [availabilityFilterKey, setAvailabilityFilterKey] = useState("");
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");

  const settingsResult = useMemo(() => RoomSettingsSchema.safeParse({
    totalRounds: Number(roundsInput),
    roundDurationSeconds: Number(durationInput),
    mapPool,
    difficultyPool,
    serverRegion,
  }), [difficultyPool, durationInput, mapPool, roundsInput, serverRegion]);
  const filterKey = `${mapPool.join(",")}|${difficultyPool.join(",")}`;
  const availabilityIsCurrent = availabilityFilterKey === filterKey;
  const currentAvailability = availabilityIsCurrent ? availability : null;

  useEffect(() => {
    if (flow === "multiplayer") multiplayerHeadingRef.current?.focus();
  }, [flow]);

  useEffect(() => {
    if (flow !== "multiplayer") {
      setAvailability(null);
      setAvailabilityFilterKey("");
      setAvailabilityError("");
      setCheckingAvailability(false);
      return;
    }
    if (mapPool.length === 0 || difficultyPool.length === 0) {
      setAvailability(null);
      setAvailabilityFilterKey("");
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
      body: JSON.stringify({ mapPool, difficultyPool }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Question bank unavailable");
      const data = await response.json() as QuestionAvailability;
      if (!controller.signal.aborted) {
        setAvailability(data);
        setAvailabilityFilterKey(`${mapPool.join(",")}|${difficultyPool.join(",")}`);
      }
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setAvailabilityError(requestError instanceof Error ? requestError.message : "Question bank unavailable");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setCheckingAvailability(false);
    });
    return () => controller.abort();
  }, [difficultyPool, flow, mapPool]);

  const availableQuestions = currentAvailability?.availableQuestions ?? 0;
  const settingsAreAvailable = settingsResult.success
    && !checkingAvailability
    && currentAvailability !== null
    && settingsResult.data.totalRounds <= availableQuestions;

  const validateNickname = (): string | null => {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError("Nickname must be between 2 and 20 characters.");
      return null;
    }
    saveNickname(parsed.data);
    getPlayerId();
    return parsed.data;
  };

  const revealSettingsIssue = (targetId: string) => {
    setSettingsExpanded(true);
    window.setTimeout(() => document.getElementById(targetId)?.focus(), 0);
  };

  const createRoom = async () => {
    const creatorNickname = validateNickname();
    if (!creatorNickname) return;
    setSettingsPanelError("");
    if (!settingsResult.success) {
      setError("Enter valid match settings: 1–50 rounds, 10–120 seconds, at least one map, and at least one difficulty.");
      const issuePath = settingsResult.error.issues[0]?.path[0];
      revealSettingsIssue(
        issuePath === "totalRounds"
          ? MATCH_SETTINGS_ROUNDS_INPUT_ID
          : issuePath === "roundDurationSeconds"
            ? MATCH_SETTINGS_DURATION_INPUT_ID
            : issuePath === "mapPool"
              ? MATCH_SETTINGS_MAP_POOL_ID
              : issuePath === "difficultyPool"
                ? MATCH_SETTINGS_DIFFICULTY_POOL_ID
              : issuePath === "serverRegion"
                ? MATCH_SETTINGS_REGION_ID
                : MATCH_SETTINGS_DETAILS_ID,
      );
      return;
    }
    if (checkingAvailability || !availabilityIsCurrent) {
      setError("Still checking the selected map and difficulty pool. Please try again in a moment.");
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    if (availabilityError || currentAvailability === null) {
      setError("The question bank is temporarily unavailable. Please try again.");
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    if (settingsResult.data.totalRounds > availableQuestions) {
      setError(`Only ${availableQuestions} questions are available for the selected map and difficulty pool.`);
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const createRequest: CreateRoomRequest = {
        settings: settingsResult.data,
        creator: { playerId: getPlayerId(), nickname: creatorNickname },
      };
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createRequest),
      });
      const responseData = await response.json().catch(() => null) as {
        roomCode?: string;
        error?: string;
        availableQuestions?: number;
      } | null;
      if (!response.ok) {
        if (responseData?.error === "NOT_ENOUGH_QUESTIONS") {
          const currentAvailable = responseData.availableQuestions ?? 0;
          setAvailability((current) => current ? { ...current, availableQuestions: currentAvailable } : current);
          setAvailabilityFilterKey(filterKey);
          setError(`Only ${currentAvailable} questions are available for the selected map and difficulty pool.`);
          revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
          return;
        }
        if (responseData?.error === "QUESTION_DATABASE_UNAVAILABLE") {
          const message = "The question database is temporarily unavailable. Please try again.";
          setError(message);
          setSettingsPanelError(message);
          revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
          return;
        }
        if (responseData?.error && CREATE_ROOM_ERROR_MESSAGES[responseData.error]) {
          const message = CREATE_ROOM_ERROR_MESSAGES[responseData.error];
          setError(message);
          setSettingsPanelError(message);
          revealSettingsIssue(settingsTargetForErrorCode(responseData.error));
          return;
        }
        const message = "The server rejected these match settings. Review them and try again.";
        setError(message);
        setSettingsPanelError(message);
        revealSettingsIssue(MATCH_SETTINGS_DETAILS_ID);
        return;
      }
      if (!responseData?.roomCode) throw new Error("Room creation failed");
      navigate(`/room/${responseData.roomCode}`);
    } catch {
      setError("Could not create a room. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startSolo = () => {
    if (!validateNickname()) return;
    setError("");
    navigate("/solo");
  };

  const openFlow = (nextFlow: Exclude<HomeFlow, "modes">) => {
    if (!validateNickname()) return;
    setError("");
    setSettingsPanelError("");
    setFlow(nextFlow);
  };

  const returnToModes = (focusId: string) => {
    setFlow("modes");
    setError("");
    setSettingsPanelError("");
    setSettingsExpanded(false);
    window.setTimeout(() => document.getElementById(focusId)?.focus(), 0);
  };

  const joinRoom = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await joinExistingRoom({ roomCode, nickname });
    setBusy(false);
    if (result.ok) navigate(`/room/${result.roomCode}`);
    else setError(result.message);
  };

  return (
    <main className="home-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="home-hero" aria-labelledby="home-title">
        <div className="home-card">
          <div className="eyebrow">SOLO · REAL-TIME MULTIPLAYER</div>
          <h1 id="home-title">
            CS2 MAP
            <span>GUESSER</span>
          </h1>
          <p className="home-lead">Read the angle. Pinpoint the position. Beat the clock.</p>

          {flow === "modes" && (
            <>
              <label htmlFor="nickname">NICKNAME</label>
              <input
                id="nickname"
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setError("");
                }}
                maxLength={20}
                placeholder="Your callsign"
                autoComplete="nickname"
              />

              <div className="home-mode-grid" role="group" aria-label="Game modes">
                <button
                  id="single-player-mode"
                  className="home-mode-card is-solo"
                  type="button"
                  aria-label="SINGLE PLAYER"
                  aria-describedby="single-player-mode-description"
                  onClick={startSolo}
                  disabled={busy}
                >
                  <span>SINGLE PLAYER</span>
                  <small id="single-player-mode-description">Configure a private practice session.</small>
                  <b aria-hidden="true">→</b>
                </button>
                <button
                  id="multiplayer-mode"
                  className="home-mode-card is-multiplayer"
                  type="button"
                  aria-label="MULTIPLAYER"
                  aria-describedby="multiplayer-mode-description"
                  onClick={() => openFlow("multiplayer")}
                  disabled={busy}
                >
                  <span>MULTIPLAYER</span>
                  <small id="multiplayer-mode-description">Create a match and invite up to four friends.</small>
                  <b aria-hidden="true">→</b>
                </button>
                <button
                  id="join-room-mode"
                  className="home-mode-card is-join"
                  type="button"
                  aria-label="JOIN ROOM"
                  aria-describedby="join-room-mode-description"
                  onClick={() => openFlow("join")}
                  disabled={busy}
                >
                  <span>JOIN ROOM</span>
                  <small id="join-room-mode-description">Enter an existing five-character code.</small>
                  <b aria-hidden="true">→</b>
                </button>
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
            </>
          )}

          {flow === "multiplayer" && (
            <section className="home-flow-panel" aria-labelledby="multiplayer-settings-title">
              <div className="home-flow-heading">
                <div>
                  <span>MULTIPLAYER</span>
                  <h2 id="multiplayer-settings-title" ref={multiplayerHeadingRef} tabIndex={-1}>ROOM SETTINGS</h2>
                </div>
                <button
                  className="home-flow-back"
                  type="button"
                  onClick={() => returnToModes("multiplayer-mode")}
                  disabled={busy}
                >
                  ← BACK
                </button>
              </div>
              <div className="home-player-identity"><span>PLAYER</span><strong>{nickname}</strong></div>

              <MatchSettingsPanel
                expanded={settingsExpanded}
                roundsInput={roundsInput}
                durationInput={durationInput}
                mapPool={mapPool}
                difficultyPool={difficultyPool}
                serverRegion={serverRegion}
                availability={currentAvailability}
                checkingAvailability={checkingAvailability || !availabilityIsCurrent}
                availabilityError={settingsPanelError || availabilityError}
                onToggle={() => setSettingsExpanded((expanded) => !expanded)}
                onRoundsChange={(value) => {
                  setSettingsPanelError("");
                  setRoundsInput(value);
                }}
                onDurationChange={(value) => {
                  setSettingsPanelError("");
                  setDurationInput(value);
                }}
                onMapPoolChange={(nextMapPool) => {
                  setSettingsPanelError("");
                  setMapPool(MAP_IDS.filter((mapId) => nextMapPool.includes(mapId)));
                }}
                onDifficultyPoolChange={(nextDifficultyPool) => {
                  setSettingsPanelError("");
                  setDifficultyPool(nextDifficultyPool);
                }}
                onServerRegionChange={(region) => {
                  setSettingsPanelError("");
                  setServerRegion(region);
                }}
              />

              <button
                className="primary-button create-room-button"
                type="button"
                onClick={createRoom}
                disabled={busy || !settingsAreAvailable}
                aria-disabled={busy || !settingsAreAvailable}
              >
                {busy ? "CONNECTING…" : "CREATE MULTIPLAYER ROOM"}
              </button>
              {error && <div className="form-error" role="alert">{error}</div>}
            </section>
          )}

          {flow === "join" && (
            <section className="home-flow-panel" aria-labelledby="join-room-title">
              <div className="home-flow-heading">
                <div>
                  <span>MULTIPLAYER</span>
                  <h2 id="join-room-title">JOIN ROOM</h2>
                </div>
                <button
                  className="home-flow-back"
                  type="button"
                  onClick={() => returnToModes("join-room-mode")}
                  disabled={busy}
                >
                  ← BACK
                </button>
              </div>
              <div className="home-player-identity"><span>PLAYER</span><strong>{nickname}</strong></div>
              <form className="home-join-form" onSubmit={joinRoom}>
                <label htmlFor="room-code">ROOM CODE</label>
                <input
                  id="room-code"
                  className="room-code-input"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  maxLength={5}
                  placeholder="K7P2A"
                  autoComplete="off"
                  autoFocus
                />
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? "JOINING…" : "JOIN ROOM"}
                </button>
              </form>
              {error && <div className="form-error" role="alert">{error}</div>}
            </section>
          )}
        </div>
      </header>

      <section className="home-information" aria-labelledby="about-game">
        <div className="home-about">
          <div className="eyebrow">KNOW THE MAPS</div>
          <h2 id="about-game">Test Your Counter-Strike 2 Map Knowledge</h2>
          <p>
            Study a real in-game screenshot, identify the CS2 map, and place your marker on its radar.
            The closer your location guess is, the more points you earn. Correct players can also gain a
            time bonus, so confident answers matter.
          </p>
          <p>
            Practice alone in Single Player, or create a private room and share its five-character code for a
            synchronized 2–5 player match. Every round reveals the answer and a detailed score breakdown.
          </p>
        </div>

        <div className="home-how-it-works">
          <div className="eyebrow">HOW IT WORKS</div>
          <h2>From Screenshot to Score</h2>
          <ol>
            <li><strong>Inspect</strong><span>Read the architecture, lighting, and landmarks in the screenshot.</span></li>
            <li><strong>Locate</strong><span>Choose the map and pinpoint the position on its radar.</span></li>
            <li><strong>Compete</strong><span>Compare distance, time, and points when the round is revealed.</span></li>
          </ol>
        </div>
      </section>

      <footer className="home-footer">
        <span>CS2 Map Guesser</span>
        <p>An unofficial community game. Counter-Strike and related game assets belong to their respective owners.</p>
      </footer>
    </main>
  );
}
