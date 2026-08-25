import { DurableObject } from "cloudflare:workers";
import {
  CreateSoloSessionRequestSchema,
  SoloAssetReadySchema,
  SoloGuessSchema,
  SoloRoundIdentitySchema,
  type SoloActionErrorCode,
  type SoloSessionState,
  type SoloSettings,
} from "../../shared/solo";
import type { Env } from "../env";
import { QuestionRepository } from "../questions/QuestionRepository";
import {
  SOLO_STATE_KEY,
  SOLO_SESSION_TTL_MS,
  advanceSoloRound,
  createInitialSoloState,
  prioritizeFreshQuestions,
  reconcileSoloState,
  revealSoloHint,
  startSoloRound,
  submitSoloGuess,
  toPublicSoloState,
  type InternalSoloState,
  type SoloActionResult,
} from "../solo/soloState";

export type SoloRpcResult =
  | { ok: true; status: 200 | 201; state: SoloSessionState }
  | {
    ok: false;
    status: 400 | 404 | 409 | 503;
    error: SoloActionErrorCode;
    availableQuestions?: number;
    requestedRounds?: number;
  };

interface InitializeSoloInput {
  sessionId: string;
  nickname: string;
  settings: SoloSettings;
}

function actionStatus(error: SoloActionErrorCode): 400 | 404 | 409 | 503 {
  if (error === "SOLO_SESSION_NOT_FOUND") return 404;
  if (error === "QUESTION_DATABASE_UNAVAILABLE") return 503;
  if (error === "INVALID_SOLO_SETTINGS" || error === "INVALID_ASSET_REPORT" || error === "INVALID_MAP_ID") return 400;
  return 409;
}

export class SoloSession extends DurableObject<Env> {
  private state: InternalSoloState | null = null;
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state = await ctx.storage.get<InternalSoloState>(SOLO_STATE_KEY) ?? null;
      if (this.state && !Number.isFinite(this.state.expiresAt)) {
        this.state.expiresAt = Date.now() + SOLO_SESSION_TTL_MS;
        await ctx.storage.put(SOLO_STATE_KEY, this.state);
      }
    });
  }

  async initialize(input: InitializeSoloInput): Promise<SoloRpcResult> {
    await this.ready;
    if (this.state) return { ok: false, status: 409, error: "INVALID_SOLO_STATE" };
    const parsed = CreateSoloSessionRequestSchema.safeParse({ nickname: input.nickname, settings: input.settings });
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_SOLO_SETTINGS" };

    const selected = await this.selectQuestions(parsed.data.settings, []);
    if (!selected.ok) return selected.result;
    this.state = createInitialSoloState({
      sessionId: input.sessionId,
      nickname: parsed.data.nickname,
      settings: parsed.data.settings,
      questionCount: selected.questionCount,
      questions: selected.questions,
    });
    await this.commit();
    return this.stateResponse(201);
  }

  async getState(): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    await this.reconcileAndCommit(now, true);
    return this.stateResponse(200);
  }

  async assetReady(payload: unknown): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    const parsed = SoloAssetReadySchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_ASSET_REPORT" };
    await this.reconcileAndCommit(now, true);
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const result = startSoloRound(this.state, parsed.data, now);
    return this.finishAction(result);
  }

  async hint(payload: unknown): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    const parsed = SoloRoundIdentitySchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_SOLO_STATE" };
    await this.reconcileAndCommit(now, true);
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const result = revealSoloHint(this.state, parsed.data.generation, parsed.data.round);
    return this.finishAction(result);
  }

  async guess(payload: unknown): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    const parsed = SoloGuessSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_SOLO_STATE" };
    const expired = await this.reconcileAndCommit(now, true);
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    if (expired) return { ok: false, status: 409, error: "ROUND_EXPIRED" };
    const result = submitSoloGuess(this.state, parsed.data, now);
    return this.finishAction(result);
  }

  async next(payload: unknown): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    const parsed = SoloRoundIdentitySchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_SOLO_STATE" };
    await this.reconcileAndCommit(now, true);
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const identityError = this.validateIdentity(parsed.data.generation, parsed.data.round);
    if (identityError) return identityError;
    return this.finishAction(advanceSoloRound(this.state));
  }

  async playAgain(payload: unknown): Promise<SoloRpcResult> {
    await this.ready;
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const now = Date.now();
    const parsed = SoloRoundIdentitySchema.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, error: "INVALID_SOLO_STATE" };
    await this.reconcileAndCommit(now, true);
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    const identityError = this.validateIdentity(parsed.data.generation, parsed.data.round);
    if (identityError) return identityError;
    if (this.state.status !== "finished") return { ok: false, status: 409, error: "INVALID_SOLO_STATE" };

    const previousIds = this.state.questionSnapshot.map((question) => question.id);
    const previousVersion = this.state.stateVersion;
    const expectedGeneration = this.state.generation;
    const nextGeneration = expectedGeneration + 1;
    const selected = await this.selectQuestions(this.state.settings, previousIds);
    if (!selected.ok) return selected.result;
    if (!this.state || this.state.generation !== expectedGeneration || this.state.status !== "finished") {
      return { ok: false, status: 409, error: "STALE_SESSION_GENERATION" };
    }
    this.state = createInitialSoloState({
      sessionId: this.state.sessionId,
      generation: nextGeneration,
      nickname: this.state.nickname,
      settings: this.state.settings,
      questionCount: selected.questionCount,
      questions: selected.questions,
      now: Date.now(),
    });
    this.state.stateVersion = previousVersion;
    await this.commit();
    return this.stateResponse(200);
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.state) return;
    await this.reconcileAndCommit(Date.now(), false);
  }

  private async selectQuestions(
    settings: SoloSettings,
    previouslyUsedIds: readonly string[],
  ): Promise<
    | { ok: true; questionCount: number; questions: InternalSoloState["questionSnapshot"] }
    | { ok: false; result: SoloRpcResult }
  > {
    try {
      const repository = new QuestionRepository(this.env.QUESTIONS_DB);
      const questionCount = await repository.countEnabledForMaps(settings.mapPool);
      if (questionCount < settings.totalRounds) {
        return {
          ok: false,
          result: {
            ok: false,
            status: 409,
            error: "NOT_ENOUGH_QUESTIONS",
            availableQuestions: questionCount,
            requestedRounds: settings.totalRounds,
          },
        };
      }
      const candidateLimit = Math.min(questionCount, settings.totalRounds + previouslyUsedIds.length);
      const candidates = await repository.getRandomEnabledForMaps(settings.mapPool, candidateLimit);
      const questions = prioritizeFreshQuestions(candidates, settings.totalRounds, previouslyUsedIds);
      if (questions.length < settings.totalRounds) {
        return {
          ok: false,
          result: {
            ok: false,
            status: 409,
            error: "NOT_ENOUGH_QUESTIONS",
            availableQuestions: questions.length,
            requestedRounds: settings.totalRounds,
          },
        };
      }
      return { ok: true, questionCount, questions };
    } catch (error) {
      console.error(JSON.stringify({
        error: "QUESTION_DATABASE_UNAVAILABLE",
        operation: "solo-question-selection",
        message: error instanceof Error ? error.message : String(error),
      }));
      return {
        ok: false,
        result: { ok: false, status: 503, error: "QUESTION_DATABASE_UNAVAILABLE" },
      };
    }
  }

  private validateIdentity(generation: number, round: number): SoloRpcResult | null {
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    if (this.state.generation !== generation) {
      return { ok: false, status: 409, error: "STALE_SESSION_GENERATION" };
    }
    if (this.state.round !== round) return { ok: false, status: 409, error: "STALE_ROUND" };
    return null;
  }

  private async finishAction<T>(result: SoloActionResult<T>): Promise<SoloRpcResult> {
    if (!result.ok) return { ok: false, status: actionStatus(result.error), error: result.error };
    if (result.changed) await this.commit();
    return this.stateResponse(200);
  }

  private async reconcileAndCommit(now: number, refreshExpiry: boolean): Promise<boolean> {
    if (!this.state) return false;
    if (now >= this.state.expiresAt) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.state = null;
      return false;
    }
    const roundExpired = reconcileSoloState(this.state, now);
    let changed = roundExpired;
    if (refreshExpiry) {
      this.state.expiresAt = now + SOLO_SESSION_TTL_MS;
      changed = true;
    }
    if (changed) await this.commit();
    else await this.scheduleAlarm();
    return roundExpired;
  }

  private async commit(): Promise<void> {
    if (!this.state) return;
    this.state.stateVersion += 1;
    await this.ctx.storage.put(SOLO_STATE_KEY, this.state);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.state) return;
    const deadlines = [this.state.expiresAt];
    if (this.state.status === "playing" && this.state.roundEndsAt !== null) deadlines.push(this.state.roundEndsAt);
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  private stateResponse(status: 200 | 201): SoloRpcResult {
    if (!this.state) return { ok: false, status: 404, error: "SOLO_SESSION_NOT_FOUND" };
    return {
      ok: true,
      status,
      state: toPublicSoloState(this.state, this.env.PUBLIC_ASSET_ORIGIN, Date.now()),
    };
  }
}
