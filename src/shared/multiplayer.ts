import { z } from "zod";

export const MIN_MULTIPLAYER_PLAYERS = 2;
export const MAX_MULTIPLAYER_PLAYERS = 5;

export const multiplayerPlayerIdSchema = z.string().uuid();
export const multiplayerNicknameSchema = z.string().trim().min(2).max(20);

export const MultiplayerCreatorSchema = z.object({
  playerId: multiplayerPlayerIdSchema,
  nickname: multiplayerNicknameSchema,
}).strict();

export type MultiplayerCreator = z.infer<typeof MultiplayerCreatorSchema>;
