import { FormEvent, useEffect, useMemo, useState } from "react";
import { nicknameSchema } from "../../shared/schemas";
import { MAP_IDS, type MapId } from "../../shared/maps";
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
  INVALID_SERVER_REGION: "The server region selection is invalid.",
};

function settingsTargetForErrorCode(errorCode: string): string {
  if (errorCode === "INVALID_ROUND_COUNT") return MATCH_SETTINGS_ROUNDS_INPUT_ID;
  if (errorCode === "INVALID_ROUND_DURATION") return MATCH_SETTINGS_DURATION_INPUT_ID;
  if (errorCode === "EMPTY_MAP_POOL" || errorCode === "INVALID_MAP_ID") return MATCH_SETTINGS_MAP_POOL_ID;
  if (errorCode === "INVALID_SERVER_REGION") return MATCH_SETTINGS_REGION_ID;
  return MATCH_SETTINGS_DETAILS_ID;
}

export function HomePage() {
  const [nickname, setNickname] = useState(getNickname);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [settingsPanelError, setSettingsPanelError] = useState("");
  const [roundsInput, setRoundsInput] = useState(String(DEFAULT_ROOM_SETTINGS.totalRounds));
  const [durationInput, setDurationInput] = useState(String(DEFAULT_ROOM_SETTINGS.roundDurationSeconds));
  const [mapPool, setMapPool] = useState<MapId[]>([...DEFAULT_ROOM_SETTINGS.mapPool]);
  const [serverRegion, setServerRegion] = useState<ServerRegion>(DEFAULT_ROOM_SETTINGS.serverRegion);
  const [availability, setAvailability] = useState<QuestionAvailability | null>(null);
  const [availabilityMapPoolKey, setAvailabilityMapPoolKey] = useState("");
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");

  const settingsResult = useMemo(() => RoomSettingsSchema.safeParse({
    totalRounds: Number(roundsInput),
    roundDurationSeconds: Number(durationInput),
    mapPool,
    serverRegion,
  }), [durationInput, mapPool, roundsInput, serverRegion]);
  const mapPoolKey = mapPool.join(",");
  const availabilityIsCurrent = availabilityMapPoolKey === mapPoolKey;
  const currentAvailability = availabilityIsCurrent ? availability : null;

  useEffect(() => {
    if (mapPool.length === 0) {
      setAvailability(null);
      setAvailabilityMapPoolKey("");
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
      const data = await response.json() as QuestionAvailability;
      if (!controller.signal.aborted) {
        setAvailability(data);
        setAvailabilityMapPoolKey(mapPool.join(","));
      }
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setAvailabilityError(requestError instanceof Error ? requestError.message : "Question bank unavailable");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setCheckingAvailability(false);
    });
    return () => controller.abort();
  }, [mapPool]);

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
    if (!validateNickname()) return;
    setSettingsPanelError("");
    if (!settingsResult.success) {
      setError("Enter valid match settings: 1–50 rounds, 10–120 seconds, and at least one map.");
      const issuePath = settingsResult.error.issues[0]?.path[0];
      revealSettingsIssue(
        issuePath === "totalRounds"
          ? MATCH_SETTINGS_ROUNDS_INPUT_ID
          : issuePath === "roundDurationSeconds"
            ? MATCH_SETTINGS_DURATION_INPUT_ID
            : issuePath === "mapPool"
              ? MATCH_SETTINGS_MAP_POOL_ID
              : issuePath === "serverRegion"
                ? MATCH_SETTINGS_REGION_ID
                : MATCH_SETTINGS_DETAILS_ID,
      );
      return;
    }
    if (checkingAvailability || !availabilityIsCurrent) {
      setError("Still checking the selected map pool. Please try again in a moment.");
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    if (availabilityError || currentAvailability === null) {
      setError("The question bank is temporarily unavailable. Please try again.");
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    if (settingsResult.data.totalRounds > availableQuestions) {
      setError(`Only ${availableQuestions} questions are available for the selected map pool.`);
      revealSettingsIssue(MATCH_SETTINGS_AVAILABILITY_ID);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const createRequest: CreateRoomRequest = { settings: settingsResult.data };
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
          setAvailabilityMapPoolKey(mapPoolKey);
          setError(`Only ${currentAvailable} questions are available for the selected map pool.`);
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
          <div className="eyebrow">REAL-TIME · TWO PLAYER</div>
          <h1 id="home-title">
            CS2 MAP
            <span>GUESSER</span>
          </h1>
          <p className="home-lead">Read the angle. Pinpoint the position. Beat the clock.</p>

          <label htmlFor="nickname">NICKNAME</label>
          <input
            id="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            placeholder="Your callsign"
            autoComplete="nickname"
          />

          <MatchSettingsPanel
            expanded={settingsExpanded}
            roundsInput={roundsInput}
            durationInput={durationInput}
            mapPool={mapPool}
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
            onServerRegionChange={(region) => {
              setSettingsPanelError("");
              setServerRegion(region);
            }}
          />

          <button
            className="primary-button create-room-button"
            type="button"
            onClick={createRoom}
            disabled={busy}
            aria-disabled={busy || !settingsAreAvailable}
          >
            {busy ? "CONNECTING…" : "CREATE ROOM"}
          </button>

          <div className="divider"><span>OR JOIN A SQUAD</span></div>
          <form onSubmit={joinRoom}>
            <label htmlFor="room-code">ROOM CODE</label>
            <input
              id="room-code"
              className="room-code-input"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={5}
              placeholder="K7P2A"
              autoComplete="off"
            />
            <button className="secondary-button" type="submit" disabled={busy}>
              JOIN ROOM
            </button>
          </form>
          {error && <div className="form-error" role="alert">{error}</div>}
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
            Create a private room, share its five-character code, and compete through a set of live rounds.
            Both players see the answer and round breakdown together before the next location begins.
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
