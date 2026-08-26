import { useEffect, useMemo, useRef, useState } from "react";
import { MAP_IDS, type MapId } from "../../shared/maps";
import type { QuestionDifficulty } from "../../shared/questionDifficulty";
import {
  RoomSettingsUpdateSchema,
  sameRoomSettings,
  type RoomSettings,
  type RoomSettingsUpdate,
} from "../../shared/roomSettings";
import type { GameErrorCode, GameRoomState } from "../../shared/types";
import { useQuestionAvailability } from "../hooks/useQuestionAvailability";
import { MatchSettingsPanel } from "./MatchSettingsPanel";

const UPDATE_ERROR_CODES = new Set<GameErrorCode>([
  "INVALID_PLAYER",
  "NOT_HOST",
  "GAME_ALREADY_STARTED",
  "ROOM_SETTINGS_CHANGED",
  "INVALID_ROOM_SETTINGS",
  "INVALID_ROUND_COUNT",
  "INVALID_ROUND_DURATION",
  "EMPTY_MAP_POOL",
  "INVALID_MAP_ID",
  "EMPTY_DIFFICULTY_POOL",
  "INVALID_DIFFICULTY",
  "NOT_ENOUGH_QUESTIONS",
  "QUESTION_DATABASE_UNAVAILABLE",
  "WEBSOCKET_DISCONNECTED",
]);

function withServerRegion(settings: RoomSettingsUpdate, serverRegion: RoomSettings["serverRegion"]): RoomSettings {
  return { ...settings, serverRegion };
}

export function WaitingRoomSettings({
  room,
  playerId,
  socketError,
  onClearSocketError,
  onApply,
}: {
  room: GameRoomState;
  playerId: string;
  socketError: { code: GameErrorCode; message: string } | null;
  onClearSocketError: () => void;
  onApply: (settings: RoomSettingsUpdate) => boolean;
}) {
  const isHost = room.hostPlayerId === playerId;
  const [expanded, setExpanded] = useState(false);
  const [roundsInput, setRoundsInput] = useState(() => String(room.settings.totalRounds));
  const [durationInput, setDurationInput] = useState(() => String(room.settings.roundDurationSeconds));
  const [mapPool, setMapPool] = useState<MapId[]>(() => [...room.settings.mapPool]);
  const [difficultyPool, setDifficultyPool] = useState<QuestionDifficulty[]>(() => [...room.settings.difficultyPool]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingSettingsRef = useRef<RoomSettings | null>(null);
  const lastAuthoritativeSettingsRef = useRef(room.settings);

  const resetDraft = (settings = room.settings) => {
    setRoundsInput(String(settings.totalRounds));
    setDurationInput(String(settings.roundDurationSeconds));
    setMapPool([...settings.mapPool]);
    setDifficultyPool([...settings.difficultyPool]);
  };

  const parsedUpdate = useMemo(() => RoomSettingsUpdateSchema.safeParse({
    totalRounds: Number(roundsInput),
    roundDurationSeconds: Number(durationInput),
    mapPool,
    difficultyPool,
  }), [difficultyPool, durationInput, mapPool, roundsInput]);
  const { availability, checkingAvailability, availabilityError } = useQuestionAvailability(
    mapPool,
    difficultyPool,
    isHost && expanded,
  );
  const availableQuestions = availability?.availableQuestions ?? 0;
  const canApply = isHost
    && expanded
    && !applying
    && parsedUpdate.success
    && !checkingAvailability
    && availability !== null
    && parsedUpdate.data.totalRounds <= availableQuestions;

  useEffect(() => {
    const previous = lastAuthoritativeSettingsRef.current;
    if (sameRoomSettings(previous, room.settings)) return;
    lastAuthoritativeSettingsRef.current = room.settings;
    resetDraft(room.settings);
    setExpanded(false);
    setApplying(false);
    setApplyError("");
    const wasPending = pendingSettingsRef.current !== null
      && sameRoomSettings(pendingSettingsRef.current, room.settings);
    pendingSettingsRef.current = null;
    setNotice(wasPending && isHost
      ? "MATCH SETTINGS UPDATED ✓ · EVERYONE MUST READY UP AGAIN"
      : "MATCH SETTINGS UPDATED · PLEASE READY UP AGAIN");
  }, [isHost, room.settings]);

  useEffect(() => {
    if (isHost) return;
    setExpanded(false);
    setApplying(false);
    setApplyError("");
    pendingSettingsRef.current = null;
    resetDraft(room.settings);
  }, [isHost, room.settings]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(""), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!applying || !socketError || !UPDATE_ERROR_CODES.has(socketError.code)) return;
    setApplying(false);
    pendingSettingsRef.current = null;
    setApplyError(socketError.message);
    onClearSocketError();
  }, [applying, onClearSocketError, socketError]);

  useEffect(() => {
    if (!applying) return;
    const timeoutId = window.setTimeout(() => {
      setApplying(false);
      pendingSettingsRef.current = null;
      setApplyError("The server did not confirm the update. Review the latest settings and try again.");
    }, 8_000);
    return () => window.clearTimeout(timeoutId);
  }, [applying]);

  const clearDraftFeedback = () => {
    setApplyError("");
    setNotice("");
  };

  const toggleEditor = () => {
    if (!isHost || applying) return;
    if (!expanded) {
      resetDraft(room.settings);
      clearDraftFeedback();
      onClearSocketError();
      setExpanded(true);
      return;
    }
    resetDraft(room.settings);
    clearDraftFeedback();
    setExpanded(false);
  };

  const cancel = () => {
    if (applying) return;
    resetDraft(room.settings);
    clearDraftFeedback();
    onClearSocketError();
    setExpanded(false);
  };

  const apply = () => {
    setApplyError("");
    onClearSocketError();
    if (!parsedUpdate.success) {
      setApplyError("Enter 1–50 whole-number rounds, 10–120 seconds, at least one map, and at least one difficulty.");
      return;
    }
    if (checkingAvailability || availability === null) {
      setApplyError("Wait for the authoritative question availability check to finish.");
      return;
    }
    if (parsedUpdate.data.totalRounds > availableQuestions) {
      setApplyError(`Only ${availableQuestions} questions are available; ${parsedUpdate.data.totalRounds} are required.`);
      return;
    }
    const nextSettings = withServerRegion(parsedUpdate.data, room.settings.serverRegion);
    if (sameRoomSettings(nextSettings, room.settings)) {
      resetDraft(room.settings);
      setExpanded(false);
      setNotice("MATCH SETTINGS ALREADY CURRENT ✓");
      return;
    }
    if (!onApply(parsedUpdate.data)) {
      setApplyError("The update could not be sent. Wait for the connection to recover and try again.");
      return;
    }
    pendingSettingsRef.current = nextSettings;
    setApplying(true);
  };

  return (
    <div className="waiting-room-settings">
      {notice && <div className="lobby-settings-notice" role="status">{notice}</div>}
      <MatchSettingsPanel
        expanded={expanded}
        roundsInput={roundsInput}
        durationInput={durationInput}
        mapPool={mapPool}
        difficultyPool={difficultyPool}
        serverRegion={room.settings.serverRegion}
        availability={availability}
        checkingAvailability={checkingAvailability}
        availabilityError={applyError || availabilityError}
        editable={isHost}
        toggleCollapsedLabel="EDIT SETTINGS"
        serverRegionReadOnly
        includeServerRegionInSummary
        disabled={applying}
        onToggle={toggleEditor}
        onRoundsChange={(value) => { clearDraftFeedback(); setRoundsInput(value); }}
        onDurationChange={(value) => { clearDraftFeedback(); setDurationInput(value); }}
        onMapPoolChange={(nextMapPool) => {
          clearDraftFeedback();
          setMapPool(MAP_IDS.filter((mapId) => nextMapPool.includes(mapId)));
        }}
        onDifficultyPoolChange={(nextDifficultyPool) => {
          clearDraftFeedback();
          setDifficultyPool(nextDifficultyPool);
        }}
      >
        <div className="waiting-settings-actions">
          <button className="secondary-button" type="button" disabled={applying} onClick={cancel}>CANCEL</button>
          <button className="primary-button" type="button" disabled={!canApply} aria-disabled={!canApply} onClick={apply}>
            {applying ? "APPLYING…" : "APPLY SETTINGS"}
          </button>
        </div>
        <small className="waiting-settings-warning">Applying changes resets every player to NOT READY.</small>
      </MatchSettingsPanel>
    </div>
  );
}
