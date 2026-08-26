import type { MapId, RadarLayerId } from "./maps";
import type { GameErrorCode, GameRoomState, MapPoint, PublicPlayer, RoundResultState } from "./types";

export const CLIENT_EVENTS = {
  JOIN: "player:join",
  LEAVE: "player:leave",
  KICK: "player:kick",
  READY: "player:ready",
  START_MATCH: "game:start",
  GUESS_SUBMIT: "guess:submit",
  SYNC: "room:sync",
  PING: "ping",
  ROUND_ASSET_READY: "round:asset-ready",
  ROUND_ASSET_ERROR: "round:asset-error",
  PLAY_AGAIN: "game:play-again",
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE: "room:state",
  PLAYER_JOINED: "player:joined",
  PLAYER_LEFT: "player:left",
  ROOM_KICKED: "room:kicked",
  PLAYER_CONNECTION: "player:connection",
  ROUND_PREPARE: "round:prepare",
  ROUND_START: "round:start",
  PLAYER_SUBMITTED: "player:submitted",
  ROUND_END: "round:end",
  GAME_END: "game:end",
  ERROR: "error",
  PONG: "pong",
} as const;

export const ASSET_LOAD_ERROR_REASONS = ["TIMEOUT", "NETWORK", "HTTP_ERROR", "DECODE_ERROR"] as const;
export type AssetLoadErrorReason = (typeof ASSET_LOAD_ERROR_REASONS)[number];

export type ClientEvent =
  | { type: "player:join"; payload: { playerId: string; nickname: string } }
  | { type: "player:leave" }
  | { type: "player:kick"; payload: { targetPlayerId: string } }
  | { type: "player:ready" }
  | { type: "game:start" }
  | {
      type: "guess:submit";
      payload: { round: number; eventId: string; mapId: MapId; layerId: RadarLayerId; point: MapPoint };
    }
  | { type: "room:sync" }
  | { type: "ping"; payload: { clientSentAt: number } }
  | {
      type: "round:asset-ready";
      payload: { round: number; questionId: string; loadMs?: number };
    }
  | {
      type: "round:asset-error";
      payload: { round: number; questionId: string; reason: AssetLoadErrorReason };
    }
  | { type: "game:play-again" };

export type ServerEvent =
  | { type: "room:state"; payload: GameRoomState }
  | { type: "player:joined"; payload: { player: PublicPlayer; stateVersion: number } }
  | { type: "player:left"; payload: { playerId: string; stateVersion: number } }
  | { type: "room:kicked"; payload: { reason: "KICKED_BY_HOST" } }
  | {
      type: "player:connection";
      payload: { playerId: string; connected: boolean; stateVersion: number };
    }
  | {
      type: "round:prepare";
      payload: {
        questionId: string;
        imageUrl: string;
        mapPool: MapId[];
        round: number;
        prepareDeadline: number;
        stateVersion: number;
      };
    }
  | {
      type: "round:start";
      payload: {
        questionId: string;
        imageUrl: string;
        round: number;
        serverNow: number;
        roundStartedAt: number;
        roundEndsAt: number;
        roundDurationSeconds: number;
        stateVersion: number;
      };
    }
  | {
      type: "player:submitted";
      payload: { playerId: string; round: number; stateVersion: number };
    }
  | { type: "round:end"; payload: RoundResultState & { stateVersion: number } }
  | { type: "game:end"; payload: { state: GameRoomState } }
  | { type: "error"; payload: { code: GameErrorCode; message: string } }
  | { type: "pong"; payload: { clientSentAt: number; serverNow: number } };
