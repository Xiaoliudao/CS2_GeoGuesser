import type { GameErrorCode, RoomStatus } from "../../shared/types";
import { normalizeScore } from "./scoring";

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

export interface VisibleScoreInput {
  status: RoomStatus;
  playerId: string;
  viewerPlayerId: string | null;
  totalScore: number;
  currentRoundPoints: number;
}

export function scoreVisibleToViewer(input: VisibleScoreInput): number {
  if (input.status !== "playing" || input.playerId === input.viewerPlayerId) return normalizeScore(input.totalScore);
  return normalizeScore(Math.max(0, input.totalScore - input.currentRoundPoints));
}
