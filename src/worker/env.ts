import type { GameRoom } from "./durableObjects/GameRoom";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  GAME_ASSETS: R2Bucket;
}
