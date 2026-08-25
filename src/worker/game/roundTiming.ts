import type { RoomSettings } from "../../shared/roomSettings";
import { roundDeadline } from "../../shared/roomSettings";
import type { RoundTiming, RoomStatus } from "../../shared/types";

export function createPreparingRoundTiming(now: number, prepareTimeoutMs: number): RoundTiming {
  return {
    prepareDeadline: now + prepareTimeoutMs,
    roundStartedAt: null,
    roundEndsAt: null,
  };
}

export function createPlayingRoundTiming(
  status: RoomStatus,
  currentQuestionId: string | null,
  now: number,
  settings: Pick<RoomSettings, "roundDurationSeconds">,
): RoundTiming | null {
  if (status !== "round_preparing" || currentQuestionId === null) return null;
  return {
    prepareDeadline: null,
    roundStartedAt: now,
    roundEndsAt: roundDeadline(now, settings),
  };
}
