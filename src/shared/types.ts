import type { MapId, RadarLayerId } from "./maps";

export type RoomStatus = "waiting" | "playing" | "round_result" | "finished";

export interface MapPoint {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  score: number;
}

export interface PublicPlayer extends Player {
  submitted: boolean;
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
  distance: number | null;
  locationScore: number;
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

export interface GameRoomState {
  roomCode: string;
  status: RoomStatus;
  players: PublicPlayer[];
  round: number;
  totalRounds: number;
  questionCount: number;
  currentQuestion: PublicQuestion | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  roundResult: RoundResultState | null;
  stateVersion: number;
}

export type GameErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_PLAYER"
  | "GAME_ALREADY_STARTED"
  | "ALREADY_SUBMITTED"
  | "ROUND_EXPIRED"
  | "INVALID_MESSAGE"
  | "WEBSOCKET_DISCONNECTED"
  | "NO_QUESTIONS_AVAILABLE"
  | "QUESTION_DATABASE_UNAVAILABLE";
