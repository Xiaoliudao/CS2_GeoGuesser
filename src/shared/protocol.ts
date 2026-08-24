import type { MapId, RadarLayerId } from "./maps";
import type { GameErrorCode, GameRoomState, MapPoint, PublicPlayer, RoundResultState } from "./types";

export const CLIENT_EVENTS = {
  JOIN: "player:join",
  READY: "player:ready",
  GUESS_SUBMIT: "guess:submit",
  SYNC: "room:sync",
  PING: "ping",
  PLAY_AGAIN: "game:play-again",
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE: "room:state",
  PLAYER_JOINED: "player:joined",
  PLAYER_LEFT: "player:left",
  PLAYER_CONNECTION: "player:connection",
  ROUND_START: "round:start",
  PLAYER_SUBMITTED: "player:submitted",
  ROUND_END: "round:end",
  GAME_END: "game:end",
  ERROR: "error",
  PONG: "pong",
} as const;

export type ClientEvent =
  | { type: "player:join"; payload: { playerId: string; nickname: string } }
  | { type: "player:ready" }
  | {
      type: "guess:submit";
      payload: { round: number; eventId: string; mapId: MapId; layerId: RadarLayerId; point: MapPoint };
    }
  | { type: "room:sync" }
  | { type: "ping"; payload?: { sentAt?: number } }
  | { type: "game:play-again" };

export type ServerEvent =
  | { type: "room:state"; payload: GameRoomState }
  | { type: "player:joined"; payload: { player: PublicPlayer; stateVersion: number } }
  | { type: "player:left"; payload: { playerId: string; stateVersion: number } }
  | {
      type: "player:connection";
      payload: { playerId: string; connected: boolean; stateVersion: number };
    }
  | {
      type: "round:start";
      payload: {
        questionId: string;
        imageUrl: string;
        round: number;
        roundEndsAt: number;
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
  | { type: "pong"; payload: { serverTime: number } };
