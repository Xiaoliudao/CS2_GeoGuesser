// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicPlayer } from "../../shared/types";
import { PlayerStrip } from "./PlayerStrip";

afterEach(cleanup);

function player(slotIndex: number, score: number, active = true): PublicPlayer {
  return {
    id: `player-${slotIndex}`,
    nickname: `Player ${slotIndex + 1}`,
    slotIndex,
    active,
    connected: active,
    ready: true,
    score,
    submitted: slotIndex % 2 === 0,
    assetReady: true,
  };
}

describe("PlayerStrip multiplayer leaderboard", () => {
  it("ranks two to five players from viewer-safe scores and retains a DNF participant", () => {
    render(<PlayerStrip players={[
      player(0, 50),
      player(1, 80),
      player(2, 100),
      player(3, 80),
      player(4, 20, false),
    ]} playerId="player-1" />);

    const scoreboard = screen.getByLabelText("Live scoreboard");
    const cards = Array.from(scoreboard.querySelectorAll<HTMLElement>(".score-player"));
    expect(cards).toHaveLength(5);
    expect(within(cards[0]).getByText("Player 3")).toBeTruthy();
    expect(cards[0].querySelector('[aria-label="Rank 1"]')).toBeTruthy();
    expect(cards[1].querySelector('[aria-label="Rank 2"]')).toBeTruthy();
    expect(cards[2].querySelector('[aria-label="Rank 2"]')).toBeTruthy();
    expect(cards[3].querySelector('[aria-label="Rank 4"]')).toBeTruthy();
    expect(within(cards[4]).getByText("DNF")).toBeTruthy();
    expect(within(cards[1]).getByText("YOU")).toBeTruthy();
  });
});
