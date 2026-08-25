import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAP_IDS, type MapId } from "../../shared/maps";
import type { ServerRegion } from "../../shared/roomSettings";
import {
  MATCH_SETTINGS_DETAILS_ID,
  MatchSettingsPanel,
  formatMatchSettingsSummary,
} from "./MatchSettingsPanel";

const noOp = () => undefined;

function renderPanel(overrides: Partial<{
  expanded: boolean;
  roundsInput: string;
  durationInput: string;
  mapPool: MapId[];
  serverRegion: ServerRegion;
  availableQuestions: number;
  checkingAvailability: boolean;
  availabilityError: string;
}> = {}) {
  return renderToStaticMarkup(createElement(MatchSettingsPanel, {
    expanded: overrides.expanded ?? false,
    roundsInput: overrides.roundsInput ?? "5",
    durationInput: overrides.durationInput ?? "20",
    mapPool: overrides.mapPool ?? [...MAP_IDS],
    serverRegion: overrides.serverRegion ?? "auto",
    availability: { availableQuestions: overrides.availableQuestions ?? 61, byMap: {} },
    checkingAvailability: overrides.checkingAvailability ?? false,
    availabilityError: overrides.availabilityError ?? "",
    onToggle: noOp,
    onRoundsChange: noOp,
    onDurationChange: noOp,
    onMapPoolChange: noOp,
    onServerRegionChange: noOp,
  }));
}

describe("compact match settings", () => {
  it("renders the default settings collapsed with one concise summary", () => {
    const markup = renderPanel();

    expect(markup).toContain("5 ROUNDS · 20 SEC · ALL MAPS");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain(`aria-controls="${MATCH_SETTINGS_DETAILS_ID}"`);
    expect(markup).toContain("CUSTOMIZE MATCH");
    expect(markup).toMatch(new RegExp(`id="${MATCH_SETTINGS_DETAILS_ID}"[^>]*hidden=""`));
    expect(markup.match(/61 QUESTIONS AVAILABLE/g)).toHaveLength(1);
  });

  it("expands the controls and exposes an accessible hide action", () => {
    const markup = renderPanel({ expanded: true });

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("HIDE SETTINGS");
    expect(markup).not.toMatch(new RegExp(`id="${MATCH_SETTINGS_DETAILS_ID}"[^>]*hidden`));
    expect(markup).toContain("QUESTIONS");
    expect(markup).toContain("ROUND TIME");
    expect(markup).toContain("MAP POOL");
    expect(markup).toContain("SERVER REGION");
  });

  it("keeps custom controlled values when collapsed and reopened", () => {
    const settings = {
      roundsInput: "10",
      durationInput: "30",
      mapPool: ["mirage", "inferno", "ancient"] as MapId[],
      serverRegion: "asia" as const,
    };
    const collapsed = renderPanel(settings);
    const expanded = renderPanel({ ...settings, expanded: true });

    expect(collapsed).toContain("10 ROUNDS · 30 SEC · 3 MAPS · ASIA");
    expect(expanded).toMatch(/aria-label="Custom question count"[^>]*value="10"/);
    expect(expanded).toMatch(/aria-label="Custom round duration in seconds"[^>]*value="30"/);
    expect(expanded).toContain("10 ROUNDS · 30 SEC · 3 MAPS · ASIA");
  });

  it("uses the map name when exactly one map is selected", () => {
    expect(formatMatchSettingsSummary({
      roundsInput: "5",
      durationInput: "20",
      mapPool: ["dust2"],
      serverRegion: "auto",
    })).toBe("5 ROUNDS · 20 SEC · DUST II");
  });

  it("shows blocking availability errors even while collapsed", () => {
    const markup = renderPanel({ roundsInput: "20", availableQuestions: 7 });

    expect(markup).toContain("ONLY 7 QUESTIONS ARE AVAILABLE");
    expect(markup).toContain('role="alert"');
  });

  it.each([
    [{ roundsInput: "0" }, "QUESTIONS MUST BE A WHOLE NUMBER FROM 1 TO 50"],
    [{ durationInput: "9" }, "ROUND TIME MUST BE A WHOLE NUMBER FROM 10 TO 120 SECONDS"],
    [{ mapPool: [] as MapId[] }, "SELECT AT LEAST ONE MAP"],
    [{ availabilityError: "Question bank unavailable" }, "Question bank unavailable"],
  ])("keeps invalid settings visible in the compact state", (overrides, message) => {
    expect(renderPanel(overrides)).toContain(message);
  });
});
