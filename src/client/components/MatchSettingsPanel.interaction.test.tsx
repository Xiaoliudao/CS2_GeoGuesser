// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_IDS, type MapId } from "../../shared/maps";
import type { ServerRegion } from "../../shared/roomSettings";
import { MATCH_SETTINGS_DETAILS_ID, MatchSettingsPanel } from "./MatchSettingsPanel";

afterEach(cleanup);

function ControlledSettings() {
  const [expanded, setExpanded] = useState(false);
  const [roundsInput, setRoundsInput] = useState("5");
  const [durationInput, setDurationInput] = useState("20");
  const [mapPool, setMapPool] = useState<MapId[]>([...MAP_IDS]);
  const [serverRegion, setServerRegion] = useState<ServerRegion>("auto");

  return (
    <MatchSettingsPanel
      expanded={expanded}
      roundsInput={roundsInput}
      durationInput={durationInput}
      mapPool={mapPool}
      serverRegion={serverRegion}
      availability={{ availableQuestions: 61, byMap: {} }}
      checkingAvailability={false}
      availabilityError=""
      onToggle={() => setExpanded((current) => !current)}
      onRoundsChange={setRoundsInput}
      onDurationChange={setDurationInput}
      onMapPoolChange={setMapPool}
      onServerRegionChange={setServerRegion}
    />
  );
}

describe("MatchSettingsPanel interactions", () => {
  it("expands and collapses from the keyboard with stable ARIA state", async () => {
    const user = userEvent.setup();
    render(<ControlledSettings />);
    const toggle = screen.getByRole("button", { name: "CUSTOMIZE MATCH" });
    const details = document.getElementById(MATCH_SETTINGS_DETAILS_ID) as HTMLDivElement;

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(details.hidden).toBe(true);

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "HIDE SETTINGS" }).getAttribute("aria-expanded")).toBe("true");
    expect(details.hidden).toBe(false);

    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }).getAttribute("aria-expanded")).toBe("false");
    expect(details.hidden).toBe(true);
  });

  it("preserves every controlled setting through collapse and reopen", async () => {
    const user = userEvent.setup();
    render(<ControlledSettings />);

    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));
    await user.click(screen.getByRole("button", { name: "15" }));
    await user.click(screen.getByRole("button", { name: "30s" }));
    await user.click(screen.getByRole("button", { name: "CLEAR" }));
    await user.click(screen.getByRole("checkbox", { name: "Mirage" }));
    await user.click(screen.getByRole("checkbox", { name: "Inferno" }));
    await user.click(screen.getByRole("checkbox", { name: "Ancient" }));
    await user.click(screen.getByRole("button", { name: "ASIA" }));
    await user.click(screen.getByRole("button", { name: "HIDE SETTINGS" }));

    expect(screen.getByText("15 ROUNDS · 30 SEC · 3 MAPS · ASIA")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));
    expect((screen.getByLabelText("Custom question count") as HTMLInputElement).value).toBe("15");
    expect((screen.getByLabelText("Custom round duration in seconds") as HTMLInputElement).value).toBe("30");
    expect(screen.getByRole("checkbox", { name: /Mirage/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /Inferno/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /Ancient/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "ASIA" }).classList.contains("is-selected")).toBe(true);
  });

  it("moves the highlight between preset buttons and custom labels", async () => {
    const user = userEvent.setup();
    render(<ControlledSettings />);
    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));

    const roundsInput = screen.getByLabelText("Custom question count");
    const durationInput = screen.getByLabelText("Custom round duration in seconds");
    const customRounds = screen.getByText("CUSTOM");
    const customDuration = screen.getByText("CUSTOM SEC");

    await user.clear(roundsInput);
    await user.type(roundsInput, "7");
    await user.clear(durationInput);
    await user.type(durationInput, "120");

    expect(customRounds.classList.contains("is-selected")).toBe(true);
    expect(customDuration.classList.contains("is-selected")).toBe(true);
    expect(screen.getByRole("button", { name: "5" }).classList.contains("is-selected")).toBe(false);
    expect(screen.getByRole("button", { name: "20s" }).classList.contains("is-selected")).toBe(false);

    await user.click(screen.getByRole("button", { name: "10" }));
    await user.click(screen.getByRole("button", { name: "45s" }));

    expect(customRounds.classList.contains("is-selected")).toBe(false);
    expect(customDuration.classList.contains("is-selected")).toBe(false);
    expect(screen.getByRole("button", { name: "10" }).classList.contains("is-selected")).toBe(true);
    expect(screen.getByRole("button", { name: "45s" }).classList.contains("is-selected")).toBe(true);
  });
});
