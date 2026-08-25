import { DurableObject } from "cloudflare:workers";
import { clientEventSchema, roomCodeSchema } from "../../shared/schemas";
import type { ParsedClientEvent } from "../../shared/schemas";
import type { ServerEvent } from "../../shared/protocol";
import type { MapId, RadarLayerId } from "../../shared/maps";
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
import { scoreVisibleToViewer, validateGuess } from "../game/roomState";
import { ROUND_DURATION_MS, normalizeScore, scoreGuess } from "../game/scoring";
import { QuestionRepository } from "../questions/QuestionRepository";

const STATE_KEY = "room-state";
const TOTAL_ROUNDS = 5;
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
  distance: number | null;
  locationScore: number;
  timeBonus?: number;
  points: number;
}

interface InternalRoomState {
  schemaVersion: 4;
  roomCode: string;
  status: RoomStatus;
  players: InternalPlayer[];
  round: number;
  totalRounds: number;
  questionCount: number;
  questionSnapshot: ServerQuestion[];
  currentQuestionId: string | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  resultEndsAt: number | null;
  guesses: Record<string, StoredGuess>;
  processedEventIds: string[];
  roundResult: RoundResultState | null;
  stateVersion: number;
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
      const stored = await ctx.storage.get<InternalRoomState & { schemaVersion?: number }>(STATE_KEY);
      if (stored && stored.schemaVersion !== 4) {
        this.state = {
          schemaVersion: 4,
          roomCode: stored.roomCode,
          status: "waiting",
          players: stored.players.map((player) => ({
            ...player,
            connected: false,
            ready: false,
            score: 0,
            disconnectExpiresAt: null,
          })),
          round: 0,
          totalRounds: 0,
          questionCount: 0,
          questionSnapshot: [],
          currentQuestionId: null,
          roundStartedAt: null,
          roundEndsAt: null,
          resultEndsAt: null,
          guesses: {},
          processedEventIds: [],
          roundResult: null,
          stateVersion: stored.stateVersion + 1,
        };
        await ctx.storage.put(STATE_KEY, this.state);
      } else {
        this.state = stored ?? null;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/initialize" && request.method === "POST") {
      return this.initialize(url.searchParams.get("roomCode"));
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

  private async initialize(rawRoomCode: string | null): Promise<Response> {
    const result = roomCodeSchema.safeParse(rawRoomCode);
    if (!result.success) return new Response("Invalid room code", { status: 400 });
    if (this.state) return new Response("Room already exists", { status: 409 });

    let questionCount = 0;
    try {
      questionCount = await this.questions().countEnabled();
    } catch (error) {
      this.logQuestionDatabaseError("initialize", error);
    }

    this.state = {
      schemaVersion: 4,
      roomCode: result.data,
      status: "waiting",
      players: [],
      round: 0,
      totalRounds: 0,
      questionCount,
      questionSnapshot: [],
      currentQuestionId: null,
      roundStartedAt: null,
      roundEndsAt: null,
      resultEndsAt: null,
      guesses: {},
      processedEventIds: [],
      roundResult: null,
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
      this.send(socket, { type: "pong", payload: { serverTime: Date.now() } });
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
    if (!player.ready) player.ready = true;
    if (this.state.players.length === 2 && this.state.players.every((candidate) => candidate.ready)) {
      try {
        const [questionCount, questions] = await Promise.all([
          this.questions().countEnabled(),
          this.questions().getRandomEnabled(TOTAL_ROUNDS),
        ]);
        this.state.questionCount = questionCount;
        if (questions.length === 0) {
          for (const candidate of this.state.players) candidate.ready = false;
          this.broadcast({
            type: "error",
            payload: { code: "NO_QUESTIONS_AVAILABLE", message: "NO REAL QUESTIONS AVAILABLE. Publish a real CS2 question first." },
          });
          await this.commit();
          return;
        }
        this.state.questionSnapshot = questions;
        this.state.totalRounds = questions.length;
        this.startRound(Date.now());
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
  }

  private async submitGuess(
    socket: WebSocket,
    player: InternalPlayer,
    payload: { round: number; eventId: string; mapId: MapId; layerId: RadarLayerId; point: MapPoint },
  ): Promise<void> {
    if (!this.state) return;
    const now = Date.now();
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

  private async playAgain(socket: WebSocket): Promise<void> {
    if (!this.state || this.state.status !== "finished") {
      this.sendError(socket, "INVALID_MESSAGE", "Play again is only available after the game.");
      return;
    }
    this.state.status = "waiting";
    this.state.round = 0;
    this.state.totalRounds = 0;
    this.state.questionSnapshot = [];
    this.state.currentQuestionId = null;
    this.state.roundStartedAt = null;
    this.state.roundEndsAt = null;
    this.state.resultEndsAt = null;
    this.state.guesses = {};
    this.state.processedEventIds = [];
    this.state.roundResult = null;
    for (const player of this.state.players) {
      player.ready = false;
      player.score = 0;
    }
    await this.commit();
  }

  private startRound(now: number): void {
    if (!this.state) return;
    const nextRound = this.state.round + 1;
    this.state.status = "playing";
    this.state.round = nextRound;
    this.state.currentQuestionId = this.state.questionSnapshot[nextRound - 1]?.id ?? null;
    this.state.roundStartedAt = now;
    this.state.roundEndsAt = now + ROUND_DURATION_MS;
    this.state.resultEndsAt = null;
    this.state.guesses = {};
    this.state.processedEventIds = [];
    this.state.roundResult = null;
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
        distance: guess?.distance ?? null,
        locationScore: guess?.locationScore ?? 0,
        timeBonus: guess?.timeBonus ?? 0,
        elapsedMs: guess?.elapsedMs ?? null,
        points: guess?.points ?? 0,
      };
    });
    this.state.status = "round_result";
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
  }

  private async reconcileAndCommit(now: number): Promise<void> {
    if (!this.state) return;
    let changed = false;

    const retainedPlayers = this.state.players.filter((player) => {
      const expired = !player.connected && player.disconnectExpiresAt !== null && now >= player.disconnectExpiresAt;
      return !expired;
    });
    if (retainedPlayers.length !== this.state.players.length) {
      this.state.players = retainedPlayers;
      changed = true;
    }

    if (this.state.status === "playing" && this.state.roundEndsAt !== null && now >= this.state.roundEndsAt) {
      this.finishRound(now);
      changed = true;
    } else if (
      this.state.status === "round_result" &&
      this.state.resultEndsAt !== null &&
      now >= this.state.resultEndsAt
    ) {
      if (this.state.round >= this.state.totalRounds) this.finishGame();
      else this.startRound(now);
      changed = true;
    }

    if (changed) await this.commit();
    else await this.scheduleAlarm();
  }

  private publicState(viewerPlayerId: string | null): GameRoomState {
    if (!this.state) throw new Error("Room is not initialized");
    const state = this.state;
    const question = this.currentQuestion();
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
      };
    });
    return {
      roomCode: state.roomCode,
      status: state.status,
      players,
      round: state.round,
      totalRounds: state.totalRounds,
      questionCount: state.questionCount,
      currentQuestion:
        (state.status === "playing" || state.status === "round_result" || state.status === "finished") && question
          ? toPublicQuestion(question)
          : null,
      roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt,
      roundResult: state.status === "round_result" || state.status === "finished" ? state.roundResult : null,
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
    const deadlines = [this.state.roundEndsAt, this.state.resultEndsAt]
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
