import { z } from "zod";
import { MAP_IDS, isLayerForMap, type MapId, type RadarLayerId } from "./maps";
import {
  MAX_ROUNDS,
  MAX_ROUND_DURATION_SECONDS,
  MIN_ROUNDS,
  MIN_ROUND_DURATION_SECONDS,
  MapPoolSchema,
} from "./roomSettings";
import {
  DEFAULT_DIFFICULTY_POOL,
  DifficultyPoolSchema,
  type QuestionDifficulty,
} from "./questionDifficulty";
import type { PlayerRoundResult, PublicQuestion } from "./types";

export const SOLO_SESSION_ID_PATTERN = /^[a-f0-9]{64}$/;

export interface SoloSettings {
  totalRounds: number;
  roundDurationSeconds: number;
  mapPool: MapId[];
  difficultyPool: QuestionDifficulty[];
}

export const DEFAULT_SOLO_SETTINGS: SoloSettings = {
  totalRounds: 5,
  roundDurationSeconds: 20,
  mapPool: [...MAP_IDS],
  difficultyPool: [...DEFAULT_DIFFICULTY_POOL],
};

export const SoloSettingsSchema = z.object({
  totalRounds: z.number().finite().int().min(MIN_ROUNDS).max(MAX_ROUNDS),
  roundDurationSeconds: z
    .number()
    .finite()
    .int()
    .min(MIN_ROUND_DURATION_SECONDS)
    .max(MAX_ROUND_DURATION_SECONDS),
  mapPool: MapPoolSchema,
  difficultyPool: DifficultyPoolSchema,
}).strict();

export const CreateSoloSessionRequestSchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  settings: SoloSettingsSchema,
}).strict();

export const SoloSessionIdSchema = z.string().regex(SOLO_SESSION_ID_PATTERN);

export const SoloRoundIdentitySchema = z.object({
  generation: z.number().int().positive(),
  round: z.number().int().positive(),
}).strict();

export const SoloAssetReadySchema = z.object({
  generation: z.number().int().positive(),
  round: z.number().int().positive(),
  questionId: z.string().min(1).max(100),
  loadMs: z.number().finite().int().min(0).max(120_000).optional(),
}).strict();

export const SoloGuessSchema = z.object({
  generation: z.number().int().positive(),
  round: z.number().int().positive(),
  eventId: z.string().uuid(),
  mapId: z.enum(MAP_IDS),
  layerId: z.enum(["main", "upper", "lower"]),
  point: z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  }).strict(),
}).strict().superRefine((guess, context) => {
  if (!isLayerForMap(guess.mapId, guess.layerId)) {
    context.addIssue({
      code: "custom",
      path: ["layerId"],
      message: "Layer is not valid for the selected map.",
    });
  }
});

export type SoloGuess = z.infer<typeof SoloGuessSchema>;
export type SoloStatus = "round_preparing" | "playing" | "round_result" | "finished";

export interface SoloRoundResult {
  round: number;
  questionId: string;
  correctMapId: MapId;
  correctLayerId: RadarLayerId;
  correctPoint: { x: number; y: number };
  player: PlayerRoundResult;
  hintUsed: boolean;
}

export interface SoloSessionState {
  sessionId: string;
  generation: number;
  nickname: string;
  status: SoloStatus;
  settings: SoloSettings;
  round: number;
  questionCount: number;
  currentQuestion: PublicQuestion | null;
  nextQuestion: PublicQuestion | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  hintUsed: boolean;
  hintMapId: MapId | null;
  roundResult: SoloRoundResult | null;
  results: SoloRoundResult[];
  totalScore: number;
  assetOrigin: string;
  stateVersion: number;
  serverNow: number;
}

export type SoloActionErrorCode =
  | "SOLO_SESSION_NOT_FOUND"
  | "INVALID_SOLO_SETTINGS"
  | "NOT_ENOUGH_QUESTIONS"
  | "QUESTION_DATABASE_UNAVAILABLE"
  | "INVALID_ASSET_REPORT"
  | "INVALID_SOLO_STATE"
  | "STALE_SESSION_GENERATION"
  | "STALE_ROUND"
  | "HINT_ALREADY_USED"
  | "ALREADY_SUBMITTED"
  | "ROUND_EXPIRED"
  | "INVALID_MAP_ID";
