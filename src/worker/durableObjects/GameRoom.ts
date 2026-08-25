import { DurableObject } from "cloudflare:workers";
import { clientEventSchema, roomCodeSchema } from "../../shared/schemas";
import type { ParsedClientEvent } from "../../shared/schemas";
import type { AssetLoadErrorReason, ServerEvent } from "../../shared/protocol";
import type { MapId, RadarLayerId } from "../../shared/maps";
import { normalizePublicOrigin } from "../../shared/mediaUrls";
import {
  RoomSettingsSchema,
  roundDeadline,
  roomSettingsFromStorage,
  roundDurationMs,
  type RoomSettings,
} from "../../shared/roomSettings";
import type {
  GameErrorCode,
  GameRoomState,
  MapPoint,
  PlayerRoundResult,
  PublicPlayer,
  RoundResultState,
  RoomStatus,
} from "../../shared/types";
import type { Env } from "../env";
import { toPublicQuestion, type ServerQuestion } from "../game/questions";
import {
  ASSET_PREPARE_TIMEOUT_MS,
  MAX_ASSET_PREPARE_RETRIES,
  allPlayersAssetReady,
  canRetryAssetPreparation,
  hasAssetPrepareTimedOut,
  isValidAssetReport,
} from "../game/assetPreparation";
import { scoreVisibleToViewer, validateGuess } from "../game/roomState";
import { normalizeScore, scoreGuess } from "../game/scoring";
import { QuestionRepository } from "../questions/QuestionRepository";

const STATE_KEY = "room-state";
const RESULT_DURATION_MS = 5_000;
const DISCONNECT_GRACE_MS = 30_000;

interface InternalPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  score: number;
  disconnectExpiresAt: number | null;
}

interface StoredGuess {
  eventId: string;
  mapId: MapId;
  layerId: RadarLayerId;
  point: MapPoint;
  submittedAt: number;
  elapsedMs: number;
  mapCorrect: boolean;
  layerCorrect: boolean;
  distance: number | null;
  mapScore: number;
  layerScore: number;
  locationScore: number;
  timeBonus?: number;
  points: number;
}

interface InternalRoomState {
  schemaVersion: 7;
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: InternalPlayer[];
  round: number;
  questionCount: number;
  questionSnapshot: ServerQuestion[];
  questionCursor: number;
  currentQuestionId: string | null;
  prepareDeadline: number | null;
  assetPrepareAttempt: number;
  assetReady: Record<string, boolean>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  resultEndsAt: number | null;
  guesses: Record<string, StoredGuess>;
  processedEventIds: string[];
  roundResult: RoundResultState | null;
  failureCode: GameErrorCode | null;
  stateVersion: number;
}

type StoredRoomState = Partial<Omit<InternalRoomState, "schemaVersion" | "settings">> & {
  schemaVersion?: number;
  settings?: unknown;
  totalRounds?: unknown;
};

function normalizeStoredGuess(guess: StoredGuess): StoredGuess {
  return {
    ...guess,
    mapScore: normalizeScore(guess.mapScore),
    layerScore: normalizeScore(guess.layerScore),
    locationScore: normalizeScore(guess.locationScore),
    timeBonus: normalizeScore(guess.timeBonus ?? 0),
    points: normalizeScore(guess.points),
  };
}

function normalizeRoundResult(result: RoundResultState | null | undefined): RoundResultState | null {
  if (!result) return null;
  return {
    ...result,
    players: result.players.map((player) => ({
      ...player,
      mapScore: normalizeScore(player.mapScore),
      layerScore: normalizeScore(player.layerScore),
      locationScore: normalizeScore(player.locationScore),
      timeBonus: normalizeScore(player.timeBonus ?? 0),
      points: normalizeScore(player.points),
    })),
  };
}

function migrateStoredState(stored: StoredRoomState): InternalRoomState {
  const questionSnapshot = stored.questionSnapshot ?? [];
  const currentQuestionId = stored.currentQuestionId ?? null;
  return {
    schemaVersion: 7,
    roomCode: stored.roomCode ?? "UNKNOWN",
    status: stored.status ?? "waiting",
    settings: roomSettingsFromStorage(stored.settings, stored.totalRounds),
    players: (stored.players ?? []).map((player) => ({ ...player, score: normalizeScore(player.score) })),
    round: stored.round ?? 0,
    questionCount: stored.questionCount ?? 0,
    questionSnapshot,
    questionCursor: stored.questionCursor
      ?? (currentQuestionId ? questionSnapshot.findIndex((question) => question.id === currentQuestionId) : -1),
    currentQuestionId,
    prepareDeadline: stored.prepareDeadline ?? null,
    assetPrepareAttempt: stored.assetPrepareAttempt ?? 0,
    assetReady: stored.assetReady ?? {},
    roundStartedAt: stored.roundStartedAt ?? null,
    roundEndsAt: stored.roundEndsAt ?? null,
    resultEndsAt: stored.resultEndsAt ?? null,
    guesses: Object.fromEntries(
      Object.entries(stored.guesses ?? {}).map(([playerId, guess]) => [playerId, normalizeStoredGuess(guess)]),
    ),
    processedEventIds: stored.processedEventIds ?? [],
    roundResult: normalizeRoundResult(stored.roundResult),
    failureCode: stored.failureCode ?? null,
    stateVersion: stored.stateVersion ?? 0,
  };
}

interface SocketAttachment {
  playerId: string | null;
  nickname: string | null;
}

export class GameRoom extends DurableObject<Env> {
  private state: InternalRoomState | null = null;
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<StoredRoomState>(STATE_KEY);
      if (stored) {
        this.state = migrateStoredState(stored);
        if (stored.schemaVersion !== 7 || stored.totalRounds !== undefined || !RoomSettingsSchema.safeParse(stored.settings).success) {
          this.state.stateVersion += 1;
          await ctx.storage.put(STATE_KEY, this.state);
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/initialize" && request.method === "POST") {
      return this.initialize(url.searchParams.get("roomCode"), request);
    }

    if (url.pathname === "/exists") {
      return Response.json({ exists: this.state !== null });
    }

    if (url.pathname !== "/websocket" || request.headers.get("Upgrade") !== "websocket") {
      return new Response("Not found", { status: 404 });
    }
    if (!this.state) {
      return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    await this.reconcileAndCommit(Date.now());
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null, nickname: null } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    await this.ready;
    await this.reconcileAndCommit(Date.now());

    if (typeof rawMessage !== "string") {
      this.sendError(socket, "INVALID_MESSAGE", "Binary messages are not supported.");
      return;
    }

    let unknownMessage: unknown;
    try {
      unknownMessage = JSON.parse(rawMessage);
    } catch {
      this.sendError(socket, "INVALID_MESSAGE", "Message must be valid JSON.");
      return;
    }

    const parsed = clientEventSchema.safeParse(unknownMessage);
    if (!parsed.success) {
      this.sendError(socket, "INVALID_MESSAGE", "Message payload failed validation.");
      return;
    }

    await this.handleEvent(socket, parsed.data);
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    await this.ready;
    const attachment = this.getAttachment(socket);
    if (attachment.playerId && this.state) {
      const anotherConnection = this.ctx.getWebSockets().some((candidate) => {
        if (candidate === socket) return false;
        return this.getAttachment(candidate).playerId === attachment.playerId;
      });
      const player = this.state.players.find((candidate) => candidate.id === attachment.playerId);
      if (player && !anotherConnection && player.connected) {
        player.connected = false;
        player.disconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;
        await this.commit();
      }
    }
    try {
      socket.close(code, reason);
    } catch {
      // The peer may already be gone.
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, "WebSocket error");
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.reconcileAndCommit(Date.now());
  }

  private async initialize(rawRoomCode: string | null, request: Request): Promise<Response> {
    const result = roomCodeSchema.safeParse(rawRoomCode);
    if (!result.success) return new Response("Invalid room code", { status: 400 });
    if (this.state) return new Response("Room already exists", { status: 409 });
    const body = await request.json().catch(() => null) as { settings?: unknown; questionCount?: unknown } | null;
    const settings = RoomSettingsSchema.safeParse(body?.settings);
    if (!settings.success) return Response.json({ error: "INVALID_ROOM_SETTINGS" }, { status: 400 });
    if (typeof body?.questionCount !== "number" || !Number.isInteger(body.questionCount) || body.questionCount < 0) {
      return Response.json({ error: "INVALID_ROOM_SETTINGS" }, { status: 400 });
    }
    if (body.questionCount < settings.data.totalRounds) {
      return Response.json({ error: "NOT_ENOUGH_QUESTIONS" }, { status: 409 });
    }

    this.state = {
      schemaVersion: 7,
      roomCode: result.data,
      status: "waiting",
      settings: settings.data,
      players: [],
      round: 0,
      questionCount: body.questionCount,
      questionSnapshot: [],
      questionCursor: -1,
      currentQuestionId: null,
      prepareDeadline: null,
      assetPrepareAttempt: 0,
      assetReady: {},
      roundStartedAt: null,
      roundEndsAt: null,
      resultEndsAt: null,
      guesses: {},
      processedEventIds: [],
      roundResult: null,
      failureCode: null,
      stateVersion: 1,
    };
    await this.ctx.storage.put(STATE_KEY, this.state);
    return Response.json({ roomCode: result.data }, { status: 201 });
  }

  private async handleEvent(socket: WebSocket, event: ParsedClientEvent): Promise<void> {
    if (!this.state) {
      this.sendError(socket, "ROOM_NOT_FOUND", "This room does not exist.");
      return;
    }

    if (event.type === "player:join") {
      await this.join(socket, event.payload.playerId, event.payload.nickname);
      return;
    }

    if (event.type === "ping") {
      this.send(socket, {
        type: "pong",
        payload: {
          serverTime: Date.now(),
          ...(event.payload?.sentAt !== undefined ? { sentAt: event.payload.sentAt } : {}),
        },
      });
      return;
    }

    const attachment = this.getAttachment(socket);
    const player = attachment.playerId
      ? this.state.players.find((candidate) => candidate.id === attachment.playerId)
      : undefined;
    if (!player) {
      this.sendError(socket, "INVALID_PLAYER", "Join the room before sending game events.");
      return;
    }

    switch (event.type) {
      case "room:sync":
        this.sendState(socket);
        break;
      case "player:ready":
        await this.readyPlayer(player);
        break;
      case "guess:submit":
        await this.submitGuess(socket, player, event.payload);
        break;
      case "round:asset-ready":
        await this.reportAssetReady(socket, player, event.payload);
        break;
      case "round:asset-error":
        await this.reportAssetError(socket, event.payload);
        break;
      case "game:play-again":
        await this.playAgain(socket);
        break;
    }
  }

  private async join(socket: WebSocket, playerId: string, nickname: string): Promise<void> {
    if (!this.state) return;
    let player = this.state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      if (this.state.status !== "waiting") {
        this.sendError(socket, "GAME_ALREADY_STARTED", "This game has already started.");
        socket.close(4003, "Game already started");
        return;
      }
      if (this.state.players.length >= 2) {
        this.sendError(socket, "ROOM_FULL", "This room already has two players.");
        socket.close(4002, "Room full");
        return;
      }
      player = {
        id: playerId,
        nickname,
        connected: true,
        ready: false,
        score: 0,
        disconnectExpiresAt: null,
      };
      this.state.players.push(player);
    } else {
      player.nickname = nickname;
      player.connected = true;
      player.disconnectExpiresAt = null;
      if (this.state.status === "round_preparing") this.state.assetReady[player.id] = false;
    }

    socket.serializeAttachment({ playerId, nickname } satisfies SocketAttachment);
    for (const candidate of this.ctx.getWebSockets()) {
      if (candidate !== socket && this.getAttachment(candidate).playerId === playerId) {
        try {
          candidate.close(4000, "Replaced by a newer connection");
        } catch {
          // Connection is already closed.
        }
      }
    }
    await this.commit();
  }

  private async readyPlayer(player: InternalPlayer): Promise<void> {
    if (!this.state || this.state.status !== "waiting") return;
    let preparedRound = false;
    if (!player.ready) player.ready = true;
    if (this.state.players.length === 2 && this.state.players.every((candidate) => candidate.ready)) {
      try {
        const requiredQuestions = this.state.settings.totalRounds;
        const mapPool = this.state.settings.mapPool;
        const questionCount = await this.questions().countEnabledForMaps(mapPool);
        const snapshotLimit = Math.min(questionCount, requiredQuestions * (MAX_ASSET_PREPARE_RETRIES + 1));
        const questions = await this.questions().getRandomEnabledForMaps(mapPool, snapshotLimit);
        this.state.questionCount = questionCount;
        if (questionCount < requiredQuestions || questions.length < requiredQuestions) {
          for (const candidate of this.state.players) candidate.ready = false;
          this.broadcast({
            type: "error",
            payload: {
              code: "NOT_ENOUGH_QUESTIONS",
              message: `Only ${Math.min(questionCount, questions.length)} questions are currently available for this map pool.`,
            },
          });
          await this.commit();
          return;
        }
        this.state.questionSnapshot = questions;
        this.state.questionCursor = -1;
        this.beginRoundPreparation(Date.now(), false);
        preparedRound = true;
      } catch (error) {
        this.logQuestionDatabaseError("start-match", error);
        for (const candidate of this.state.players) candidate.ready = false;
        this.broadcast({
          type: "error",
          payload: {
            code: "QUESTION_DATABASE_UNAVAILABLE",
            message: "Question database is temporarily unavailable. Please retry.",
          },
        });
      }
    }
    await this.commit();
    if (preparedRound) this.broadcastRoundPrepare();
  }

  private async submitGuess(
    socket: WebSocket,
    player: InternalPlayer,
    payload: { round: number; eventId: string; mapId: MapId; layerId: RadarLayerId; point: MapPoint },
  ): Promise<void> {
    if (!this.state) return;
    const now = Date.now();
    if (!this.state.settings.mapPool.includes(payload.mapId)) {
      this.sendError(socket, "INVALID_MAP_ID", "That map is not part of this room's map pool.");
      return;
    }
    const validationError = validateGuess({
      playerExists: true,
      status: this.state.status,
      submittedRound: payload.round,
      currentRound: this.state.round,
      eventId: payload.eventId,
      processedEventIds: this.state.processedEventIds,
      alreadySubmitted: Boolean(this.state.guesses[player.id]),
      now,
      roundEndsAt: this.state.roundEndsAt,
    });
    if (validationError) {
      this.sendError(socket, validationError, this.errorMessage(validationError));
      return;
    }
    if (!this.state.currentQuestionId || this.state.roundStartedAt === null) {
      this.sendError(socket, "ROUND_EXPIRED", "There is no active question.");
      return;
    }

    const question = this.currentQuestion();
    if (!question) {
      this.sendError(socket, "QUESTION_DATABASE_UNAVAILABLE", "The active question snapshot is unavailable. Please retry the match.");
      return;
    }
    const score = scoreGuess(
      question,
      payload.mapId,
      payload.layerId,
      payload.point,
      this.state.roundStartedAt,
      now,
      roundDurationMs(this.state.settings),
    );
    this.state.processedEventIds.push(payload.eventId);
    this.state.guesses[player.id] = {
      eventId: payload.eventId,
      mapId: payload.mapId,
      layerId: payload.layerId,
      point: payload.point,
      submittedAt: now,
      ...score,
    };
    player.score = normalizeScore(player.score + score.points);

    if (this.state.players.length > 0 && this.state.players.every((candidate) => this.state?.guesses[candidate.id])) {
      this.finishRound(now);
    }
    await this.commit();
  }

  private async reportAssetReady(
    socket: WebSocket,
    player: InternalPlayer,
    payload: { round: number; questionId: string; loadMs?: number },
  ): Promise<void> {
    if (!this.state || !isValidAssetReport({
      status: this.state.status,
      reportedRound: payload.round,
      currentRound: this.state.round,
      reportedQuestionId: payload.questionId,
      currentQuestionId: this.state.currentQuestionId,
    })) {
      this.sendError(socket, "INVALID_ASSET_REPORT", "Asset readiness does not match the current prepared round.");
      return;
    }
    if (this.state.assetReady[player.id]) return;
    this.state.assetReady[player.id] = true;
    this.logGameEvent("PLAYER_ASSET_READY", {
      round: this.state.round,
      attempt: this.state.assetPrepareAttempt,
      loadMs: payload.loadMs ?? null,
    });
    if (allPlayersAssetReady(this.state.players.map((candidate) => candidate.id), this.state.assetReady)) {
      const now = Date.now();
      this.startPreparedRound(now);
      await this.commit();
      this.broadcastRoundStart();
      return;
    }
    await this.commit();
  }

  private async reportAssetError(
    socket: WebSocket,
    payload: { round: number; questionId: string; reason: AssetLoadErrorReason },
  ): Promise<void> {
    if (!this.state || !isValidAssetReport({
      status: this.state.status,
      reportedRound: payload.round,
      currentRound: this.state.round,
      reportedQuestionId: payload.questionId,
      currentQuestionId: this.state.currentQuestionId,
    })) {
      this.sendError(socket, "INVALID_ASSET_REPORT", "Asset error does not match the current prepared round.");
      return;
    }
    this.logGameEvent("PLAYER_ASSET_ERROR", {
      round: this.state.round,
      attempt: this.state.assetPrepareAttempt,
      reason: payload.reason,
    });
    const retried = this.retryAssetPreparation(Date.now(), payload.reason);
    await this.commit();
    if (retried) this.broadcastRoundPrepare();
    else this.broadcast({
      type: "error",
      payload: {
        code: "NETWORK_ASSET_FAILURE",
        message: "The round assets could not be loaded reliably. No points were awarded for this question.",
      },
    });
  }

  private async playAgain(socket: WebSocket): Promise<void> {
    if (!this.state || this.state.status !== "finished") {
      this.sendError(socket, "INVALID_MESSAGE", "Play again is only available after the game.");
      return;
    }
    this.state.status = "waiting";
    this.state.round = 0;
    this.state.questionSnapshot = [];
    this.state.questionCursor = -1;
    this.state.currentQuestionId = null;
    this.state.prepareDeadline = null;
    this.state.assetPrepareAttempt = 0;
    this.state.assetReady = {};
    this.state.roundStartedAt = null;
    this.state.roundEndsAt = null;
    this.state.resultEndsAt = null;
    this.state.guesses = {};
    this.state.processedEventIds = [];
    this.state.roundResult = null;
    this.state.failureCode = null;
    for (const player of this.state.players) {
      player.ready = false;
      player.score = 0;
    }
    await this.commit();
  }

  private beginRoundPreparation(now: number, retry: boolean): void {
    if (!this.state) return;
    const nextQuestionIndex = this.state.questionCursor + 1;
    const question = this.state.questionSnapshot[nextQuestionIndex];
    if (!question) {
      this.failAssetPreparation();
      return;
    }
    this.state.status = "round_preparing";
    if (!retry) this.state.round += 1;
    this.state.questionCursor = nextQuestionIndex;
    this.state.currentQuestionId = question.id;
    this.state.prepareDeadline = now + ASSET_PREPARE_TIMEOUT_MS;
    this.state.assetPrepareAttempt = retry ? this.state.assetPrepareAttempt + 1 : 0;
    this.state.assetReady = Object.fromEntries(this.state.players.map((player) => [player.id, false]));
    this.state.roundStartedAt = null;
    this.state.roundEndsAt = null;
    this.state.resultEndsAt = null;
    this.state.guesses = {};
    this.state.processedEventIds = [];
    this.state.roundResult = null;
    this.state.failureCode = null;
    this.logGameEvent("ROUND_PREPARE", {
      round: this.state.round,
      attempt: this.state.assetPrepareAttempt,
      prepareTimeoutMs: ASSET_PREPARE_TIMEOUT_MS,
    });
  }

  private startPreparedRound(now: number): void {
    if (!this.state || this.state.status !== "round_preparing" || !this.state.currentQuestionId) return;
    this.state.status = "playing";
    this.state.prepareDeadline = null;
    this.state.roundStartedAt = now;
    this.state.roundEndsAt = roundDeadline(now, this.state.settings);
    this.logGameEvent("ROUND_STARTED", {
      round: this.state.round,
      attempt: this.state.assetPrepareAttempt,
      durationMs: roundDurationMs(this.state.settings),
    });
  }

  private retryAssetPreparation(now: number, reason: AssetLoadErrorReason | "TIMEOUT"): boolean {
    if (!this.state) return false;
    const nextQuestionIndex = this.state.questionCursor + 1;
    if (!canRetryAssetPreparation(
      this.state.assetPrepareAttempt,
      nextQuestionIndex,
      this.state.questionSnapshot.length,
    )) {
      this.failAssetPreparation();
      return false;
    }
    this.logGameEvent("ROUND_ASSET_RETRY", {
      round: this.state.round,
      previousAttempt: this.state.assetPrepareAttempt,
      reason,
    });
    this.beginRoundPreparation(now, true);
    return true;
  }

  private failAssetPreparation(): void {
    if (!this.state) return;
    this.state.status = "finished";
    this.state.currentQuestionId = null;
    this.state.prepareDeadline = null;
    this.state.assetReady = {};
    this.state.roundStartedAt = null;
    this.state.roundEndsAt = null;
    this.state.resultEndsAt = null;
    this.state.guesses = {};
    this.state.processedEventIds = [];
    this.state.roundResult = null;
    this.state.failureCode = "NETWORK_ASSET_FAILURE";
  }

  private finishRound(now: number): void {
    if (!this.state || !this.state.currentQuestionId) return;
    const question = this.currentQuestion();
    if (!question) {
      this.finishGame();
      return;
    }
    const nextRoundAt = now + RESULT_DURATION_MS;
    const players: PlayerRoundResult[] = this.state.players.map((player) => {
      const guess = this.state?.guesses[player.id];
      return {
        playerId: player.id,
        nickname: player.nickname,
        submitted: Boolean(guess),
        mapGuess: guess?.mapId ?? null,
        layerGuess: guess?.layerId ?? null,
        pointGuess: guess?.point ?? null,
        mapCorrect: guess?.mapCorrect ?? false,
        layerCorrect: guess?.layerCorrect ?? false,
        distance: guess?.distance ?? null,
        mapScore: guess?.mapScore ?? 0,
        layerScore: guess?.layerScore ?? 0,
        locationScore: guess?.locationScore ?? 0,
        timeBonus: guess?.timeBonus ?? 0,
        elapsedMs: guess?.elapsedMs ?? null,
        points: guess?.points ?? 0,
      };
    });
    this.state.status = "round_result";
    this.state.prepareDeadline = null;
    this.state.roundEndsAt = null;
    this.state.resultEndsAt = nextRoundAt;
    this.state.roundResult = {
      correctMapId: question.correctMapId,
      correctLayerId: question.correctLayerId,
      correctPoint: question.correctPoint,
      players,
      nextRoundAt,
    };
  }

  private finishGame(): void {
    if (!this.state) return;
    this.state.status = "finished";
    this.state.resultEndsAt = null;
    this.state.failureCode = null;
  }

  private async reconcileAndCommit(now: number): Promise<void> {
    if (!this.state) return;
    let changed = false;
    let preparedRound = false;
    let assetFailure = false;

    const retainedPlayers = this.state.players.filter((player) => {
      const expired = !player.connected && player.disconnectExpiresAt !== null && now >= player.disconnectExpiresAt;
      return !expired;
    });
    if (retainedPlayers.length !== this.state.players.length) {
      this.state.players = retainedPlayers;
      changed = true;
    }

    if (
      this.state.status === "round_preparing"
      && hasAssetPrepareTimedOut(this.state.prepareDeadline, now)
    ) {
      this.logGameEvent("ASSET_PREPARE_TIMEOUT", {
        round: this.state.round,
        attempt: this.state.assetPrepareAttempt,
      });
      preparedRound = this.retryAssetPreparation(now, "TIMEOUT");
      assetFailure = !preparedRound;
      changed = true;
    } else if (this.state.status === "playing" && this.state.roundEndsAt !== null && now >= this.state.roundEndsAt) {
      this.finishRound(now);
      changed = true;
    } else if (
      this.state.status === "round_result" &&
      this.state.resultEndsAt !== null &&
      now >= this.state.resultEndsAt
    ) {
      if (this.state.round >= this.state.settings.totalRounds) this.finishGame();
      else {
        this.beginRoundPreparation(now, false);
        preparedRound = true;
      }
      changed = true;
    }

    if (changed) {
      await this.commit();
      if (preparedRound) this.broadcastRoundPrepare();
      if (assetFailure) this.broadcast({
        type: "error",
        payload: {
          code: "NETWORK_ASSET_FAILURE",
          message: "The round assets could not be loaded reliably. No points were awarded for this question.",
        },
      });
    } else await this.scheduleAlarm();
  }

  private publicState(viewerPlayerId: string | null): GameRoomState {
    if (!this.state) throw new Error("Room is not initialized");
    const state = this.state;
    const question = this.currentQuestion();
    const nextQuestion = this.nextQuestion();
    const assetOrigin = normalizePublicOrigin(this.env.PUBLIC_ASSET_ORIGIN);
    const players: PublicPlayer[] = state.players.map((player) => {
      const guess = state.guesses[player.id];
      return {
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
        ready: player.ready,
        score: scoreVisibleToViewer({
          status: state.status,
          playerId: player.id,
          viewerPlayerId,
          totalScore: player.score,
          currentRoundPoints: guess?.points ?? 0,
        }),
        submitted: Boolean(guess),
        assetReady: state.status === "round_preparing" && state.assetReady[player.id] === true,
      };
    });
    return {
      roomCode: state.roomCode,
      status: state.status,
      settings: { ...state.settings, mapPool: [...state.settings.mapPool] },
      players,
      round: state.round,
      questionCount: state.questionCount,
      currentQuestion:
        (state.status === "round_preparing" || state.status === "playing" || state.status === "round_result" || state.status === "finished") && question
          ? toPublicQuestion(question, assetOrigin)
          : null,
      nextQuestion:
        (state.status === "playing" || state.status === "round_result") && nextQuestion
          ? toPublicQuestion(nextQuestion, assetOrigin)
          : null,
      prepareDeadline: state.prepareDeadline,
      assetPrepareAttempt: state.assetPrepareAttempt,
      roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt,
      roundResult: state.status === "round_result" || state.status === "finished" ? state.roundResult : null,
      assetOrigin,
      failureCode: state.failureCode,
      stateVersion: state.stateVersion,
    };
  }

  private async commit(): Promise<void> {
    if (!this.state) return;
    this.state.stateVersion += 1;
    await this.ctx.storage.put(STATE_KEY, this.state);
    await this.scheduleAlarm();
    this.broadcastState();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.state) return;
    const deadlines = [this.state.prepareDeadline, this.state.roundEndsAt, this.state.resultEndsAt]
      .concat(this.state.players.map((player) => player.disconnectExpiresAt))
      .filter((deadline): deadline is number => deadline !== null);
    if (deadlines.length > 0) await this.ctx.storage.setAlarm(Math.min(...deadlines));
    else await this.ctx.storage.deleteAlarm();
  }

  private sendState(socket: WebSocket): void {
    if (!this.state) return;
    this.send(socket, {
      type: "room:state",
      payload: this.publicState(this.getAttachment(socket).playerId),
    });
  }

  private broadcastState(): void {
    for (const socket of this.ctx.getWebSockets()) this.sendState(socket);
  }

  private broadcast(event: ServerEvent): void {
    for (const socket of this.ctx.getWebSockets()) this.send(socket, event);
  }

  private broadcastRoundPrepare(): void {
    if (!this.state || this.state.status !== "round_preparing" || this.state.prepareDeadline === null) return;
    const question = this.currentQuestion();
    if (!question) return;
    this.broadcast({
      type: "round:prepare",
      payload: {
        ...toPublicQuestion(question, this.env.PUBLIC_ASSET_ORIGIN),
        mapPool: [...this.state.settings.mapPool],
        round: this.state.round,
        prepareDeadline: this.state.prepareDeadline,
        stateVersion: this.state.stateVersion,
      },
    });
  }

  private broadcastRoundStart(): void {
    if (!this.state || this.state.status !== "playing" || this.state.roundEndsAt === null) return;
    const question = this.currentQuestion();
    if (!question) return;
    this.broadcast({
      type: "round:start",
      payload: {
        ...toPublicQuestion(question, this.env.PUBLIC_ASSET_ORIGIN),
        round: this.state.round,
        roundEndsAt: this.state.roundEndsAt,
        stateVersion: this.state.stateVersion,
      },
    });
  }

  private send(socket: WebSocket, event: ServerEvent): void {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      // The close handler will update connection state.
    }
  }

  private sendError(socket: WebSocket, code: GameErrorCode, message: string): void {
    this.send(socket, { type: "error", payload: { code, message } });
  }

  private getAttachment(socket: WebSocket): SocketAttachment {
    const value = socket.deserializeAttachment() as SocketAttachment | null;
    return value ?? { playerId: null, nickname: null };
  }

  private questions(): QuestionRepository {
    return new QuestionRepository(this.env.QUESTIONS_DB);
  }

  private currentQuestion(): ServerQuestion | null {
    if (!this.state?.currentQuestionId) return null;
    return this.state.questionSnapshot.find((question) => question.id === this.state?.currentQuestionId) ?? null;
  }

  private nextQuestion(): ServerQuestion | null {
    if (!this.state || this.state.round >= this.state.settings.totalRounds) return null;
    return this.state.questionSnapshot[this.state.questionCursor + 1] ?? null;
  }

  private logGameEvent(event: string, details: Record<string, string | number | boolean | null>): void {
    console.log(JSON.stringify({ event, ...details }));
  }

  private logQuestionDatabaseError(operation: string, error: unknown): void {
    console.error(JSON.stringify({
      error: "QUESTION_DATABASE_UNAVAILABLE",
      operation,
      message: error instanceof Error ? error.message : String(error),
    }));
  }

  private errorMessage(code: GameErrorCode): string {
    if (code === "ALREADY_SUBMITTED") return "You already submitted a guess for this round.";
    if (code === "ROUND_EXPIRED") return "This round has already ended.";
    return code;
  }
}
