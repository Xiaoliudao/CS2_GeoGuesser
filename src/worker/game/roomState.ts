import type { GameErrorCode } from "../../shared/types";

export interface GuessValidationInput {
  playerExists: boolean;
  status: string;
  submittedRound: number;
  currentRound: number;
  eventId: string;
  processedEventIds: readonly string[];
  alreadySubmitted: boolean;
  now: number;
  roundEndsAt: number | null;
}

export function validateGuess(input: GuessValidationInput): GameErrorCode | null {
  if (!input.playerExists) return "INVALID_PLAYER";
  if (input.status !== "playing") return "ROUND_EXPIRED";
  if (input.submittedRound !== input.currentRound) return "ROUND_EXPIRED";
  if (input.processedEventIds.includes(input.eventId)) return "ALREADY_SUBMITTED";
  if (input.alreadySubmitted) return "ALREADY_SUBMITTED";
  if (input.roundEndsAt === null || input.now > input.roundEndsAt) return "ROUND_EXPIRED";
  return null;
}
