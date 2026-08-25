import { MAPS, type MapId } from "../../shared/maps";
import type { QuestionAvailability, ServerRegion } from "../../shared/roomSettings";

const ROUND_PRESETS = [5, 10, 15, 20] as const;
const DURATION_PRESETS = [15, 20, 30, 45] as const;

export function MatchSettingsPanel({
  roundsInput,
  durationInput,
  mapPool,
  serverRegion,
  availability,
  checkingAvailability,
  availabilityError,
  onRoundsChange,
  onDurationChange,
  onMapPoolChange,
  onServerRegionChange,
}: {
  roundsInput: string;
  durationInput: string;
  mapPool: MapId[];
  serverRegion: ServerRegion;
  availability: QuestionAvailability | null;
  checkingAvailability: boolean;
  availabilityError: string;
  onRoundsChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onMapPoolChange: (mapPool: MapId[]) => void;
  onServerRegionChange: (region: ServerRegion) => void;
}) {
  const selectedRounds = Number(roundsInput);
  const selectedDuration = Number(durationInput);
  const availableQuestions = availability?.availableQuestions ?? 0;
  const invalidRounds = roundsInput === "" || !Number.isInteger(selectedRounds) || selectedRounds < 1 || selectedRounds > 50;
  const invalidDuration = durationInput === "" || !Number.isInteger(selectedDuration) || selectedDuration < 10 || selectedDuration > 120;
  const notEnoughQuestions = !checkingAvailability && availability !== null && !invalidRounds && selectedRounds > availableQuestions;
  const toggleMap = (mapId: MapId) => {
    onMapPoolChange(
      mapPool.includes(mapId)
        ? mapPool.filter((candidate) => candidate !== mapId)
        : MAPS.map((map) => map.id).filter((candidate) => candidate === mapId || mapPool.includes(candidate)),
    );
  };

  return (
    <section className="match-settings" aria-labelledby="match-settings-title">
      <div className="match-settings-heading">
        <span>MATCH SETTINGS</span>
        <strong id="match-settings-title">CUSTOM MATCH</strong>
      </div>

      <fieldset className="setting-group">
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
          <span>CUSTOM</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            value={roundsInput}
            onChange={(event) => onRoundsChange(event.target.value)}
            aria-label="Custom question count"
          />
        </label>
      </fieldset>

      <fieldset className="setting-group server-region-setting">
        <legend>SERVER REGION</legend>
        <div className="setting-presets region-presets">
          <button type="button" className={serverRegion === "auto" ? "is-selected" : ""} onClick={() => onServerRegionChange("auto")}>AUTO</button>
          <button type="button" className={serverRegion === "asia" ? "is-selected" : ""} onClick={() => onServerRegionChange("asia")}>ASIA</button>
        </div>
        <small>AUTO places new rooms near the first request. ASIA gives first creation a best-effort APAC hint.</small>
      </fieldset>

      <fieldset className="setting-group">
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
          <span>CUSTOM SEC</span>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            max={120}
            step={1}
            value={durationInput}
            onChange={(event) => onDurationChange(event.target.value)}
            aria-label="Custom round duration in seconds"
          />
        </label>
      </fieldset>

      <div className="setting-group map-pool-setting" role="group" aria-labelledby="map-pool-label">
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

      <div className={`question-availability ${availabilityError || mapPool.length === 0 || invalidRounds || invalidDuration || notEnoughQuestions ? "is-error" : ""}`} aria-live="polite">
        {mapPool.length === 0
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
              : <><strong>{availableQuestions} QUESTIONS AVAILABLE</strong><span>Across {mapPool.length} selected map{mapPool.length === 1 ? "" : "s"}</span></>}
      </div>
    </section>
  );
}
