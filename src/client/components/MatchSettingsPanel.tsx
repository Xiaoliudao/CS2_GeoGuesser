import { MAPS, type MapId } from "../../shared/maps";
import type { QuestionAvailability, ServerRegion } from "../../shared/roomSettings";

const ROUND_PRESETS = [5, 10, 15, 20] as const;
const DURATION_PRESETS = [15, 20, 30, 45] as const;

export const MATCH_SETTINGS_DETAILS_ID = "match-settings-details";
export const MATCH_SETTINGS_QUESTIONS_ID = "match-settings-questions";
export const MATCH_SETTINGS_ROUNDS_INPUT_ID = "match-settings-rounds-input";
export const MATCH_SETTINGS_DURATION_ID = "match-settings-duration";
export const MATCH_SETTINGS_DURATION_INPUT_ID = "match-settings-duration-input";
export const MATCH_SETTINGS_MAP_POOL_ID = "match-settings-map-pool";
export const MATCH_SETTINGS_REGION_ID = "match-settings-region";
export const MATCH_SETTINGS_AVAILABILITY_ID = "match-settings-availability";

interface MatchSettingsPanelProps {
  expanded: boolean;
  roundsInput: string;
  durationInput: string;
  mapPool: MapId[];
  serverRegion: ServerRegion;
  availability: QuestionAvailability | null;
  checkingAvailability: boolean;
  availabilityError: string;
  onToggle: () => void;
  onRoundsChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onMapPoolChange: (mapPool: MapId[]) => void;
  onServerRegionChange: (region: ServerRegion) => void;
}

export function formatMatchSettingsSummary({
  roundsInput,
  durationInput,
  mapPool,
  serverRegion,
}: Pick<MatchSettingsPanelProps, "roundsInput" | "durationInput" | "mapPool" | "serverRegion">): string {
  const parsedRounds = Number(roundsInput);
  const parsedDuration = Number(durationInput);
  const rounds = roundsInput !== "" && Number.isInteger(parsedRounds) ? parsedRounds : "—";
  const duration = durationInput !== "" && Number.isInteger(parsedDuration) ? parsedDuration : "—";
  let mapSummary = `${mapPool.length} MAPS`;

  if (mapPool.length === MAPS.length && MAPS.every((map) => mapPool.includes(map.id))) {
    mapSummary = "ALL MAPS";
  } else if (mapPool.length === 1) {
    mapSummary = MAPS.find((map) => map.id === mapPool[0])?.name.toUpperCase() ?? "1 MAP";
  }

  return [
    `${rounds} ROUNDS`,
    `${duration} SEC`,
    mapSummary,
    serverRegion === "asia" ? "ASIA" : null,
  ].filter((part): part is string => part !== null).join(" · ");
}

export function MatchSettingsPanel({
  expanded,
  roundsInput,
  durationInput,
  mapPool,
  serverRegion,
  availability,
  checkingAvailability,
  availabilityError,
  onToggle,
  onRoundsChange,
  onDurationChange,
  onMapPoolChange,
  onServerRegionChange,
}: MatchSettingsPanelProps) {
  const selectedRounds = Number(roundsInput);
  const selectedDuration = Number(durationInput);
  const customRoundsSelected = !ROUND_PRESETS.some((rounds) => rounds === selectedRounds);
  const customDurationSelected = !DURATION_PRESETS.some((seconds) => seconds === selectedDuration);
  const availableQuestions = availability?.availableQuestions ?? 0;
  const invalidRounds = roundsInput === "" || !Number.isInteger(selectedRounds) || selectedRounds < 1 || selectedRounds > 50;
  const invalidDuration = durationInput === "" || !Number.isInteger(selectedDuration) || selectedDuration < 10 || selectedDuration > 120;
  const notEnoughQuestions = !checkingAvailability && availability !== null && !invalidRounds && selectedRounds > availableQuestions;
  const hasAvailabilityError = Boolean(availabilityError) || mapPool.length === 0 || invalidRounds || invalidDuration || notEnoughQuestions;
  const showCompactNote = hasAvailabilityError || checkingAvailability;
  const summary = formatMatchSettingsSummary({ roundsInput, durationInput, mapPool, serverRegion });
  const toggleMap = (mapId: MapId) => {
    onMapPoolChange(
      mapPool.includes(mapId)
        ? mapPool.filter((candidate) => candidate !== mapId)
        : MAPS.map((map) => map.id).filter((candidate) => candidate === mapId || mapPool.includes(candidate)),
    );
  };

  const availabilityContent = mapPool.length === 0
    ? <strong>SELECT AT LEAST ONE MAP</strong>
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
              : <><strong>{availableQuestions} QUESTIONS AVAILABLE</strong><span>Across {mapPool.length} selected map{mapPool.length === 1 ? "" : "s"}</span></>;

  return (
    <section className={`match-settings ${expanded ? "is-expanded" : ""}`} aria-labelledby="match-settings-title">
      <div className="match-settings-compact">
        <div className="match-settings-copy">
          <span id="match-settings-title">MATCH SETTINGS</span>
          <strong>{summary}</strong>
          {!expanded && showCompactNote && (
            <div
              className={`match-settings-note ${hasAvailabilityError ? "is-error" : ""}`}
              role={hasAvailabilityError ? "alert" : undefined}
              aria-live="polite"
            >
              {availabilityContent}
            </div>
          )}
        </div>
        <button
          className="match-settings-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={MATCH_SETTINGS_DETAILS_ID}
          onClick={onToggle}
        >
          {expanded ? "HIDE SETTINGS" : "CUSTOMIZE MATCH"} <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </button>
      </div>

      <div id={MATCH_SETTINGS_DETAILS_ID} className="match-settings-details" hidden={!expanded} tabIndex={-1}>
        <fieldset id={MATCH_SETTINGS_QUESTIONS_ID} className="setting-group" tabIndex={-1}>
          <legend>QUESTIONS</legend>
          <div className="setting-presets">
            {ROUND_PRESETS.map((rounds) => (
              <button
                key={rounds}
                type="button"
                className={selectedRounds === rounds ? "is-selected" : ""}
                disabled={checkingAvailability || availability === null || rounds > availableQuestions}
                onClick={() => onRoundsChange(String(rounds))}
              >
                {rounds}
              </button>
            ))}
          </div>
          <label className="custom-setting-input">
            <span className={customRoundsSelected ? "is-selected" : ""}>CUSTOM</span>
            <input
              id={MATCH_SETTINGS_ROUNDS_INPUT_ID}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              step={1}
              value={roundsInput}
              onChange={(event) => onRoundsChange(event.target.value)}
              aria-label="Custom question count"
              aria-invalid={invalidRounds}
              aria-describedby={MATCH_SETTINGS_AVAILABILITY_ID}
            />
          </label>
        </fieldset>

        <fieldset id={MATCH_SETTINGS_DURATION_ID} className="setting-group" tabIndex={-1}>
          <legend>ROUND TIME</legend>
          <div className="setting-presets">
            {DURATION_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={selectedDuration === seconds ? "is-selected" : ""}
                onClick={() => onDurationChange(String(seconds))}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <label className="custom-setting-input">
            <span className={customDurationSelected ? "is-selected" : ""}>CUSTOM SEC</span>
            <input
              id={MATCH_SETTINGS_DURATION_INPUT_ID}
              type="number"
              inputMode="numeric"
              min={10}
              max={120}
              step={1}
              value={durationInput}
              onChange={(event) => onDurationChange(event.target.value)}
              aria-label="Custom round duration in seconds"
              aria-invalid={invalidDuration}
              aria-describedby={MATCH_SETTINGS_AVAILABILITY_ID}
            />
          </label>
        </fieldset>

        <div
          id={MATCH_SETTINGS_MAP_POOL_ID}
          className="setting-group map-pool-setting"
          role="group"
          aria-labelledby="map-pool-label"
          aria-invalid={mapPool.length === 0}
          aria-describedby={MATCH_SETTINGS_AVAILABILITY_ID}
          tabIndex={-1}
        >
          <div className="map-pool-toolbar">
            <span id="map-pool-label" className="setting-group-label">MAP POOL</span>
            <div className="map-pool-actions" aria-label="Map pool selection actions">
              <button type="button" onClick={() => onMapPoolChange(MAPS.map((map) => map.id))}>SELECT ALL</button>
              <button type="button" onClick={() => onMapPoolChange([])}>CLEAR</button>
            </div>
          </div>
          <div className="map-pool-grid">
            {MAPS.map((map) => {
              const selected = mapPool.includes(map.id);
              return (
                <button
                  key={map.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  className={selected ? "is-selected" : ""}
                  onClick={() => toggleMap(map.id)}
                >
                  <span>{map.name}</span><b>{selected ? "✓" : ""}</b>
                </button>
              );
            })}
          </div>
        </div>

        <fieldset id={MATCH_SETTINGS_REGION_ID} className="setting-group server-region-setting" tabIndex={-1}>
          <legend>SERVER REGION</legend>
          <div className="setting-presets region-presets">
            <button type="button" className={serverRegion === "auto" ? "is-selected" : ""} onClick={() => onServerRegionChange("auto")}>AUTO</button>
            <button type="button" className={serverRegion === "asia" ? "is-selected" : ""} onClick={() => onServerRegionChange("asia")}>ASIA</button>
          </div>
          <small>AUTO places new rooms near the first request. ASIA gives first creation a best-effort APAC hint.</small>
        </fieldset>

        <div
          id={MATCH_SETTINGS_AVAILABILITY_ID}
          className={`question-availability ${hasAvailabilityError ? "is-error" : ""}`}
          role={hasAvailabilityError ? "alert" : "status"}
          aria-live="polite"
          tabIndex={-1}
        >
          {availabilityContent}
        </div>
      </div>
    </section>
  );
}
