import { MAPS, type MapId } from "../../shared/maps";
import {
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_LABELS,
  type QuestionDifficulty,
} from "../../shared/questionDifficulty";
import type { QuestionAvailability } from "../../shared/roomSettings";
import { DifficultyPoolSelector } from "./DifficultyPoolSelector";

const ROUND_PRESETS = [5, 10, 15, 20] as const;
const DURATION_PRESETS = [15, 20, 30, 45] as const;

export const SOLO_SETTINGS_DETAILS_ID = "solo-settings-details";
export const SOLO_SETTINGS_ROUNDS_INPUT_ID = "solo-settings-rounds-input";
export const SOLO_SETTINGS_DURATION_INPUT_ID = "solo-settings-duration-input";
export const SOLO_SETTINGS_MAP_POOL_ID = "solo-settings-map-pool";
export const SOLO_SETTINGS_DIFFICULTY_POOL_ID = "solo-settings-difficulty-pool";
export const SOLO_SETTINGS_AVAILABILITY_ID = "solo-settings-availability";

interface SoloSettingsPanelProps {
  expanded: boolean;
  roundsInput: string;
  durationInput: string;
  mapPool: MapId[];
  difficultyPool: QuestionDifficulty[];
  availability: QuestionAvailability | null;
  checkingAvailability: boolean;
  availabilityError: string;
  onToggle: () => void;
  onRoundsChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onMapPoolChange: (mapPool: MapId[]) => void;
  onDifficultyPoolChange: (difficultyPool: QuestionDifficulty[]) => void;
}

export function formatSoloSettingsSummary(
  props: Pick<SoloSettingsPanelProps, "roundsInput" | "durationInput" | "mapPool" | "difficultyPool">,
): string {
  const parsedRounds = Number(props.roundsInput);
  const parsedDuration = Number(props.durationInput);
  const rounds = props.roundsInput !== "" && Number.isInteger(parsedRounds) ? parsedRounds : "—";
  const duration = props.durationInput !== "" && Number.isInteger(parsedDuration) ? parsedDuration : "—";
  let maps = `${props.mapPool.length} MAPS`;
  if (props.mapPool.length === MAPS.length && MAPS.every((map) => props.mapPool.includes(map.id))) maps = "ALL MAPS";
  else if (props.mapPool.length === 1) maps = MAPS.find((map) => map.id === props.mapPool[0])?.name.toUpperCase() ?? "1 MAP";
  const canonicalDifficulties = QUESTION_DIFFICULTIES.filter((difficulty) => props.difficultyPool.includes(difficulty));
  const difficulties = canonicalDifficulties.length === QUESTION_DIFFICULTIES.length
    ? "ALL DIFFICULTIES"
    : canonicalDifficulties.length > 0
      ? canonicalDifficulties.map((difficulty) => QUESTION_DIFFICULTY_LABELS[difficulty]).join(" + ")
      : "NO DIFFICULTY";
  return `${rounds} ROUNDS · ${duration} SEC · ${maps} · ${difficulties}`;
}

export function SoloSettingsPanel({
  expanded,
  roundsInput,
  durationInput,
  mapPool,
  difficultyPool,
  availability,
  checkingAvailability,
  availabilityError,
  onToggle,
  onRoundsChange,
  onDurationChange,
  onMapPoolChange,
  onDifficultyPoolChange,
}: SoloSettingsPanelProps) {
  const selectedRounds = Number(roundsInput);
  const selectedDuration = Number(durationInput);
  const invalidRounds = roundsInput === "" || !Number.isInteger(selectedRounds) || selectedRounds < 1 || selectedRounds > 50;
  const invalidDuration = durationInput === "" || !Number.isInteger(selectedDuration) || selectedDuration < 10 || selectedDuration > 120;
  const availableQuestions = availability?.availableQuestions ?? 0;
  const notEnoughQuestions = !checkingAvailability && availability !== null && !invalidRounds && selectedRounds > availableQuestions;
  const hasError = Boolean(availabilityError)
    || mapPool.length === 0
    || difficultyPool.length === 0
    || invalidRounds
    || invalidDuration
    || notEnoughQuestions;
  const customRoundsSelected = !ROUND_PRESETS.some((rounds) => rounds === selectedRounds);
  const customDurationSelected = !DURATION_PRESETS.some((seconds) => seconds === selectedDuration);
  const summary = formatSoloSettingsSummary({ roundsInput, durationInput, mapPool, difficultyPool });
  const toggleMap = (mapId: MapId) => onMapPoolChange(
    mapPool.includes(mapId)
      ? mapPool.filter((candidate) => candidate !== mapId)
      : MAPS.map((map) => map.id).filter((candidate) => candidate === mapId || mapPool.includes(candidate)),
  );

  const availabilityContent = mapPool.length === 0
    ? <strong>SELECT AT LEAST ONE MAP</strong>
    : difficultyPool.length === 0
      ? <strong>SELECT AT LEAST ONE DIFFICULTY</strong>
    : invalidRounds
      ? <strong>QUESTIONS MUST BE A WHOLE NUMBER FROM 1 TO 50</strong>
      : invalidDuration
        ? <strong>ROUND TIME MUST BE A WHOLE NUMBER FROM 10 TO 120 SECONDS</strong>
        : checkingAvailability
          ? <strong>CHECKING QUESTION BANK…</strong>
          : availabilityError
            ? <strong>{availabilityError}</strong>
            : notEnoughQuestions
              ? <><strong>ONLY {availableQuestions} QUESTIONS ARE AVAILABLE</strong><span>Requested: {selectedRounds}</span></>
              : <><strong>{availableQuestions} QUESTIONS AVAILABLE</strong><span>Across {mapPool.length} selected map{mapPool.length === 1 ? "" : "s"} and {difficultyPool.length} difficult{difficultyPool.length === 1 ? "y" : "ies"}</span></>;

  return (
    <section className={`match-settings solo-settings ${expanded ? "is-expanded" : ""}`} aria-labelledby="solo-settings-title">
      <div className="match-settings-compact">
        <div className="match-settings-copy">
          <span id="solo-settings-title">MATCH SETTINGS</span>
          <strong>{summary}</strong>
          {!expanded && (hasError || checkingAvailability) && (
            <div className={`match-settings-note ${hasError ? "is-error" : ""}`} role={hasError ? "alert" : "status"}>
              {availabilityContent}
            </div>
          )}
        </div>
        <button className="match-settings-toggle" type="button" aria-expanded={expanded} aria-controls={SOLO_SETTINGS_DETAILS_ID} onClick={onToggle}>
          {expanded ? "HIDE SETTINGS" : "CUSTOMIZE"} <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </button>
      </div>

      <div id={SOLO_SETTINGS_DETAILS_ID} className="match-settings-details" hidden={!expanded} tabIndex={-1}>
        <fieldset className="setting-group">
          <legend>QUESTIONS</legend>
          <div className="setting-presets">
            {ROUND_PRESETS.map((rounds) => (
              <button key={rounds} type="button" className={selectedRounds === rounds ? "is-selected" : ""} disabled={checkingAvailability || availability === null || rounds > availableQuestions} onClick={() => onRoundsChange(String(rounds))}>{rounds}</button>
            ))}
          </div>
          <label className="custom-setting-input">
            <span className={customRoundsSelected ? "is-selected" : ""}>CUSTOM</span>
            <input id={SOLO_SETTINGS_ROUNDS_INPUT_ID} type="number" inputMode="numeric" min={1} max={50} step={1} value={roundsInput} onChange={(event) => onRoundsChange(event.target.value)} aria-label="Custom solo question count" aria-invalid={invalidRounds} aria-describedby={SOLO_SETTINGS_AVAILABILITY_ID} />
          </label>
        </fieldset>

        <fieldset className="setting-group">
          <legend>ROUND TIME</legend>
          <div className="setting-presets">
            {DURATION_PRESETS.map((seconds) => (
              <button key={seconds} type="button" className={selectedDuration === seconds ? "is-selected" : ""} onClick={() => onDurationChange(String(seconds))}>{seconds}s</button>
            ))}
          </div>
          <label className="custom-setting-input">
            <span className={customDurationSelected ? "is-selected" : ""}>CUSTOM SEC</span>
            <input id={SOLO_SETTINGS_DURATION_INPUT_ID} type="number" inputMode="numeric" min={10} max={120} step={1} value={durationInput} onChange={(event) => onDurationChange(event.target.value)} aria-label="Custom solo round duration in seconds" aria-invalid={invalidDuration} aria-describedby={SOLO_SETTINGS_AVAILABILITY_ID} />
          </label>
        </fieldset>

        <DifficultyPoolSelector
          id={SOLO_SETTINGS_DIFFICULTY_POOL_ID}
          difficultyPool={difficultyPool}
          ariaDescribedBy={SOLO_SETTINGS_AVAILABILITY_ID}
          onChange={onDifficultyPoolChange}
        />

        <div id={SOLO_SETTINGS_MAP_POOL_ID} className="setting-group map-pool-setting" role="group" aria-labelledby="solo-map-pool-label" aria-invalid={mapPool.length === 0} tabIndex={-1}>
          <div className="map-pool-toolbar">
            <span id="solo-map-pool-label" className="setting-group-label">MAP POOL</span>
            <div className="map-pool-actions" aria-label="Solo map pool selection actions">
              <button type="button" onClick={() => onMapPoolChange(MAPS.map((map) => map.id))}>SELECT ALL</button>
              <button type="button" onClick={() => onMapPoolChange([])}>CLEAR</button>
            </div>
          </div>
          <div className="map-pool-grid">
            {MAPS.map((map) => {
              const selected = mapPool.includes(map.id);
              return <button key={map.id} type="button" role="checkbox" aria-checked={selected} className={selected ? "is-selected" : ""} onClick={() => toggleMap(map.id)}><span>{map.name}</span><b>{selected ? "✓" : ""}</b></button>;
            })}
          </div>
        </div>

        <div id={SOLO_SETTINGS_AVAILABILITY_ID} className={`question-availability ${hasError ? "is-error" : ""}`} role={hasError ? "alert" : "status"} aria-live="polite" tabIndex={-1}>
          {availabilityContent}
        </div>
      </div>
    </section>
  );
}
