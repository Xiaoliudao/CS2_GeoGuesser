// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_IDS, type MapId } from "../../shared/maps";
import { DEFAULT_SOLO_SETTINGS } from "../../shared/solo";
import { SoloSettingsPanel } from "./SoloSettingsPanel";

afterEach(cleanup);

function ControlledSoloSettings() {
  const [expanded, setExpanded] = useState(false);
  const [rounds, setRounds] = useState(String(DEFAULT_SOLO_SETTINGS.totalRounds));
  const [duration, setDuration] = useState(String(DEFAULT_SOLO_SETTINGS.roundDurationSeconds));
  const [mapPool, setMapPool] = useState<MapId[]>([...MAP_IDS]);
  return (
    <SoloSettingsPanel
      expanded={expanded}
      roundsInput={rounds}
      durationInput={duration}
      mapPool={mapPool}
      availability={{ availableQuestions: 100, byMap: {} }}
      checkingAvailability={false}
      availabilityError=""
      onToggle={() => setExpanded((current) => !current)}
      onRoundsChange={setRounds}
      onDurationChange={setDuration}
      onMapPoolChange={setMapPool}
    />
  );
}

describe("SoloSettingsPanel", () => {
  it("starts collapsed at 5 rounds, 20 seconds, and all maps without a server region", async () => {
    const user = userEvent.setup();
    render(<ControlledSoloSettings />);

    expect(screen.getByText("5 ROUNDS · 20 SEC · ALL MAPS")).toBeTruthy();
    expect(screen.queryByText("SERVER REGION")).toBeNull();
    await user.click(screen.getByRole("button", { name: "CUSTOMIZE" }));

    expect((screen.getByLabelText("Custom solo question count") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Custom solo round duration in seconds") as HTMLInputElement).value).toBe("20");
    expect(screen.getAllByRole("checkbox")).toHaveLength(MAP_IDS.length);
    expect(screen.queryByText("SERVER REGION")).toBeNull();
  });
});
