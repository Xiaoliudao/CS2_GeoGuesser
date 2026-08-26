import type { MapId, RadarLayerId } from "./maps";
import { MAX_MULTIPLAYER_PLAYERS } from "./multiplayer";
import type { RoomSettings } from "./roomSettings";

export type RoomStatus = "waiting" | "round_preparing" | "playing" | "round_result" | "finished";

export interface MapPoint {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  nickname: string;
  slotIndex: number;
  active: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
}

export interface PublicPlayer extends Player {
  submitted: boolean;
  assetReady: boolean;
}

export interface PublicQuestion {
  questionId: string;
  imageUrl: string;
}

export interface PlayerRoundResult {
  playerId: string;
  nickname: string;
  submitted: boolean;
  mapGuess: MapId | null;
  layerGuess: RadarLayerId | null;
  pointGuess: MapPoint | null;
  mapCorrect: boolean;
  layerCorrect: boolean;
  distance: number | null;
  mapScore: number;
  layerScore: number;
  locationScore: number;
  timeBonus?: number;
  elapsedMs: number | null;
  points: number;
}

export interface RoundResultState {
  correctMapId: MapId;
  correctLayerId: RadarLayerId;
  correctPoint: MapPoint;
  players: PlayerRoundResult[];
  nextRoundAt: number;
}

export interface RoundTiming {
  prepareDeadline: number | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
}

export interface GameRoomState extends RoundTiming {
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  hostPlayerId: string | null;
  maxPlayers: typeof MAX_MULTIPLAYER_PLAYERS;
  players: PublicPlayer[];
  round: number;
  questionCount: number;
  currentQuestion: PublicQuestion | null;
  nextQuestion: PublicQuestion | null;
  assetPrepareAttempt: number;
  roundResult: RoundResultState | null;
  assetOrigin: string;
  failureCode: GameErrorCode | null;
  stateVersion: number;
  serverNow: number;
}

export type GameErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_PLAYER"
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYERS_NOT_READY"
  | "GAME_ALREADY_STARTED"
  | "ALREADY_SUBMITTED"
  | "ROUND_EXPIRED"
  | "INVALID_MESSAGE"
  | "WEBSOCKET_DISCONNECTED"
  | "NO_QUESTIONS_AVAILABLE"
  | "QUESTION_DATABASE_UNAVAILABLE"
  | "INVALID_ROOM_SETTINGS"
  | "INVALID_ROUND_COUNT"
  | "INVALID_ROUND_DURATION"
  | "EMPTY_MAP_POOL"
  | "INVALID_MAP_ID"
  | "EMPTY_DIFFICULTY_POOL"
  | "INVALID_DIFFICULTY"
  | "NOT_ENOUGH_QUESTIONS"
  | "INVALID_ASSET_REPORT"
  | "NETWORK_ASSET_FAILURE"
  | "INVALID_SERVER_REGION";
