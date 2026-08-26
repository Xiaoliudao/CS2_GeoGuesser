import type { MapId, RadarLayerId } from "../../shared/maps";
import { normalizePublicOrigin } from "../../shared/mediaUrls";
import {
  DEFAULT_DIFFICULTY_POOL,
  QuestionDifficultySchema,
} from "../../shared/questionDifficulty";
import { roundDurationMs } from "../../shared/roomSettings";
import type {
  SoloActionErrorCode,
  SoloGuess,
  SoloRoundResult,
  SoloSessionState,
  SoloSettings,
} from "../../shared/solo";
import { SoloSettingsSchema } from "../../shared/solo";
import type { MapPoint, PlayerRoundResult } from "../../shared/types";
import { toPublicQuestion, type ServerQuestion } from "../game/questions";
import { normalizeScore, scoreGuess } from "../game/scoring";

export const SOLO_STATE_KEY = "solo-state";
export const SOLO_PLAYER_ID = "solo";
export const SOLO_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

interface StoredSoloGuess {
  eventId: string;
  mapId: MapId;
  layerId: RadarLayerId;
  point: MapPoint;
  submittedAt: number;
}

export interface InternalSoloState {
  schemaVersion: 2;
  sessionId: string;
  generation: number;
  nickname: string;
  status: SoloSessionState["status"];
  settings: SoloSettings;
  round: number;
  questionCount: number;
  questionSnapshot: ServerQuestion[];
  questionCursor: number;
  currentQuestionId: string | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  hintUsed: boolean;
  guess: StoredSoloGuess | null;
  processedEventIds: string[];
  roundResult: SoloRoundResult | null;
  results: SoloRoundResult[];
  totalScore: number;
  expiresAt: number;
  stateVersion: number;
}

export function storedSoloStateNeedsMigration(stored: InternalSoloState): boolean {
  const raw = stored as InternalSoloState & { schemaVersion?: number };
  return raw.schemaVersion !== 2
    || !SoloSettingsSchema.safeParse(raw.settings).success
    || raw.questionSnapshot.some((question) => !QuestionDifficultySchema.safeParse(
      (question as ServerQuestion & { difficulty?: unknown }).difficulty,
    ).success);
}

export function migrateStoredSoloState(stored: InternalSoloState): InternalSoloState {
  const rawSettings = stored.settings as SoloSettings & { difficultyPool?: unknown };
  const parsedSettings = SoloSettingsSchema.safeParse(rawSettings);
  const legacySettings = parsedSettings.success
    ? parsedSettings.data
    : SoloSettingsSchema.parse({
        ...rawSettings,
        difficultyPool: [...DEFAULT_DIFFICULTY_POOL],
      });
  return {
    ...stored,
    schemaVersion: 2,
    settings: {
      ...legacySettings,
      mapPool: [...legacySettings.mapPool],
      difficultyPool: [...legacySettings.difficultyPool],
    },
    questionSnapshot: stored.questionSnapshot.map((question) => {
      const parsedDifficulty = QuestionDifficultySchema.safeParse(
        (question as ServerQuestion & { difficulty?: unknown }).difficulty,
      );
      return {
        ...question,
        difficulty: parsedDifficulty.success ? parsedDifficulty.data : "hard",
      };
    }),
  };
}

export type SoloActionResult<T = undefined> =
  | { ok: true; changed: boolean; value: T }
  | { ok: false; changed: false; error: SoloActionErrorCode };

function success<T>(value: T, changed = true): SoloActionResult<T> {
  return { ok: true, changed, value };
}

function failure<T>(error: SoloActionErrorCode): SoloActionResult<T> {
  return { ok: false, changed: false, error };
}

export function createInitialSoloState({
  sessionId,
  generation = 1,
  nickname,
  settings,
  questionCount,
  questions,
  now = Date.now(),
}: {
  sessionId: string;
  generation?: number;
  nickname: string;
  settings: SoloSettings;
  questionCount: number;
  questions: ServerQuestion[];
  now?: number;
}): InternalSoloState {
  if (questions.length < settings.totalRounds) throw new Error("NOT_ENOUGH_QUESTIONS");
  return {
    schemaVersion: 2,
    sessionId,
    generation,
    nickname,
    status: "round_preparing",
    settings: {
      ...settings,
      mapPool: [...settings.mapPool],
      difficultyPool: [...settings.difficultyPool],
    },
    round: 1,
    questionCount,
    questionSnapshot: questions.slice(0, settings.totalRounds),
    questionCursor: 0,
    currentQuestionId: questions[0]?.id ?? null,
    roundStartedAt: null,
    roundEndsAt: null,
    hintUsed: false,
    guess: null,
    processedEventIds: [],
    roundResult: null,
    results: [],
    totalScore: 0,
    expiresAt: now + SOLO_SESSION_TTL_MS,
    stateVersion: 0,
  };
}

export function currentSoloQuestion(state: InternalSoloState): ServerQuestion | null {
  if (!state.currentQuestionId) return null;
  return state.questionSnapshot.find((question) => question.id === state.currentQuestionId) ?? null;
}

export function nextSoloQuestion(state: InternalSoloState): ServerQuestion | null {
  return state.questionSnapshot[state.questionCursor + 1] ?? null;
}

export function prioritizeFreshQuestions(
  candidates: ServerQuestion[],
  count: number,
  previouslyUsedIds: readonly string[],
): ServerQuestion[] {
  const unique = [...new Map(candidates.map((question) => [question.id, question])).values()];
  const previouslyUsed = new Set(previouslyUsedIds);
  const fresh = unique.filter((question) => !previouslyUsed.has(question.id));
  const reused = unique.filter((question) => previouslyUsed.has(question.id));
  return [...fresh, ...reused].slice(0, Math.max(0, Math.floor(count)));
}

export function startSoloRound(
  state: InternalSoloState,
  payload: { generation: number; round: number; questionId: string },
  now: number,
): SoloActionResult<undefined> {
  if (state.generation !== payload.generation) return failure("STALE_SESSION_GENERATION");
  if (
    state.status === "playing"
    && state.round === payload.round
    && state.currentQuestionId === payload.questionId
  ) return success(undefined, false);
  if (state.status !== "round_preparing") return failure("INVALID_SOLO_STATE");
  if (state.round !== payload.round || state.currentQuestionId !== payload.questionId) {
    return failure("INVALID_ASSET_REPORT");
  }
  state.status = "playing";
  state.roundStartedAt = now;
  state.roundEndsAt = now + roundDurationMs(state.settings);
  return success(undefined);
}

export function revealSoloHint(
  state: InternalSoloState,
  generation: number,
  round: number,
): SoloActionResult<{ mapId: MapId }> {
  if (state.generation !== generation) return failure("STALE_SESSION_GENERATION");
  if (state.round !== round) return failure("STALE_ROUND");
  if (state.status !== "playing") return failure("INVALID_SOLO_STATE");
  if (state.hintUsed) return failure("HINT_ALREADY_USED");
  const question = currentSoloQuestion(state);
  if (!question) return failure("INVALID_SOLO_STATE");
  state.hintUsed = true;
  return success({ mapId: question.correctMapId });
}

function noGuessResult(state: InternalSoloState, question: ServerQuestion): SoloRoundResult {
  const player: PlayerRoundResult = {
    playerId: SOLO_PLAYER_ID,
    nickname: state.nickname,
    submitted: false,
    mapGuess: null,
    layerGuess: null,
    pointGuess: null,
    mapCorrect: false,
    layerCorrect: false,
    distance: null,
    mapScore: 0,
    layerScore: 0,
    locationScore: 0,
    timeBonus: 0,
    elapsedMs: null,
    points: 0,
  };
  return {
    round: state.round,
    questionId: question.id,
    correctMapId: question.correctMapId,
    correctLayerId: question.correctLayerId,
    correctPoint: { ...question.correctPoint },
    player,
    hintUsed: state.hintUsed,
  };
}

function completeSoloRound(state: InternalSoloState, result: SoloRoundResult): void {
  state.status = "round_result";
  state.roundEndsAt = null;
  state.roundResult = result;
  state.results.push(result);
  state.totalScore = normalizeScore(state.totalScore + result.player.points);
}

export function submitSoloGuess(
  state: InternalSoloState,
  payload: SoloGuess,
  now: number,
): SoloActionResult<SoloRoundResult> {
  if (state.generation !== payload.generation) return failure("STALE_SESSION_GENERATION");
  if (state.round !== payload.round) return failure("STALE_ROUND");
  if (state.processedEventIds.includes(payload.eventId) && state.roundResult?.round === payload.round) {
    return success(state.roundResult, false);
  }
  if (state.status !== "playing") {
    return failure(state.roundResult ? "ALREADY_SUBMITTED" : "INVALID_SOLO_STATE");
  }
  if (state.roundEndsAt === null || now >= state.roundEndsAt) return failure("ROUND_EXPIRED");
  if (!state.settings.mapPool.includes(payload.mapId)) return failure("INVALID_MAP_ID");
  if (state.guess) return failure("ALREADY_SUBMITTED");
  const question = currentSoloQuestion(state);
  if (!question || state.roundStartedAt === null) return failure("INVALID_SOLO_STATE");

  const score = scoreGuess(
    question,
    payload.mapId,
    payload.layerId,
    payload.point,
    state.roundStartedAt,
    now,
    roundDurationMs(state.settings),
  );
  state.guess = {
    eventId: payload.eventId,
    mapId: payload.mapId,
    layerId: payload.layerId,
    point: { ...payload.point },
    submittedAt: now,
  };
  state.processedEventIds.push(payload.eventId);
  const result: SoloRoundResult = {
    round: state.round,
    questionId: question.id,
    correctMapId: question.correctMapId,
    correctLayerId: question.correctLayerId,
    correctPoint: { ...question.correctPoint },
    player: {
      playerId: SOLO_PLAYER_ID,
      nickname: state.nickname,
      submitted: true,
      mapGuess: payload.mapId,
      layerGuess: payload.layerId,
      pointGuess: { ...payload.point },
      mapCorrect: score.mapCorrect,
      layerCorrect: score.layerCorrect,
      distance: score.distance,
      mapScore: score.mapScore,
      layerScore: score.layerScore,
      locationScore: score.locationScore,
      timeBonus: score.timeBonus,
      elapsedMs: score.elapsedMs,
      points: score.points,
    },
    hintUsed: state.hintUsed,
  };
  completeSoloRound(state, result);
  return success(result);
}

export function reconcileSoloState(state: InternalSoloState, now: number): boolean {
  if (state.status !== "playing" || state.roundEndsAt === null || now < state.roundEndsAt) return false;
  const question = currentSoloQuestion(state);
  if (!question) return false;
  completeSoloRound(state, noGuessResult(state, question));
  return true;
}

export function advanceSoloRound(state: InternalSoloState): SoloActionResult<undefined> {
  if (state.status !== "round_result") return failure("INVALID_SOLO_STATE");
  if (state.round >= state.settings.totalRounds) {
    state.status = "finished";
    state.currentQuestionId = null;
    state.roundStartedAt = null;
    state.roundEndsAt = null;
    state.hintUsed = false;
    state.guess = null;
    state.roundResult = null;
    return success(undefined);
  }
  const nextCursor = state.questionCursor + 1;
  const question = state.questionSnapshot[nextCursor];
  if (!question) return failure("INVALID_SOLO_STATE");
  state.status = "round_preparing";
  state.round += 1;
  state.questionCursor = nextCursor;
  state.currentQuestionId = question.id;
  state.roundStartedAt = null;
  state.roundEndsAt = null;
  state.hintUsed = false;
  state.guess = null;
  state.roundResult = null;
  return success(undefined);
}

function cloneSoloResult(result: SoloRoundResult): SoloRoundResult {
  return {
    ...result,
    correctPoint: { ...result.correctPoint },
    player: {
      ...result.player,
      pointGuess: result.player.pointGuess ? { ...result.player.pointGuess } : null,
    },
  };
}

export function toPublicSoloState(
  state: InternalSoloState,
  rawAssetOrigin = "",
  serverNow = Date.now(),
): SoloSessionState {
  const assetOrigin = normalizePublicOrigin(rawAssetOrigin);
  const question = currentSoloQuestion(state);
  const nextQuestion = nextSoloQuestion(state);
  const canShowCurrent = state.status !== "finished" && question !== null;
  const canPrefetchNext = (state.status === "playing" || state.status === "round_result") && nextQuestion !== null;
  return {
    sessionId: state.sessionId,
    generation: state.generation,
    nickname: state.nickname,
    status: state.status,
    settings: { ...state.settings, mapPool: [...state.settings.mapPool] },
    round: state.round,
    questionCount: state.questionCount,
    currentQuestion: canShowCurrent ? toPublicQuestion(question, assetOrigin) : null,
    nextQuestion: canPrefetchNext ? toPublicQuestion(nextQuestion, assetOrigin) : null,
    roundStartedAt: state.status === "playing" ? state.roundStartedAt : null,
    roundEndsAt: state.status === "playing" ? state.roundEndsAt : null,
    hintUsed: state.hintUsed,
    hintMapId: state.hintUsed && question ? question.correctMapId : null,
    roundResult: state.status === "round_result" && state.roundResult
      ? cloneSoloResult(state.roundResult)
      : null,
    results: state.results.map(cloneSoloResult),
    totalScore: normalizeScore(state.totalScore),
    assetOrigin,
    stateVersion: state.stateVersion,
    serverNow,
  };
}
