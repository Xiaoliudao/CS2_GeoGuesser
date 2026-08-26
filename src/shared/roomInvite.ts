import { z } from "zod";
import { MAX_MULTIPLAYER_PLAYERS } from "./multiplayer";
import { DifficultyPoolSchema } from "./questionDifficulty";
import { roomCodeSchema } from "./schemas";

export const RoomInviteUnavailableReasonSchema = z.enum([
  "full",
  "in_progress",
  "expired",
]);

const RoomInviteSettingsSchema = z.object({
  totalRounds: z.number().int().min(1).max(50),
  roundDurationSeconds: z.number().int().min(10).max(120),
  mapCount: z.number().int().min(1),
  difficultyPool: DifficultyPoolSchema,
  serverRegion: z.enum(["auto", "asia"]),
}).strict();

export const RoomInvitePreviewSchema = z.discriminatedUnion("exists", [
  z.object({
    exists: z.literal(false),
    joinable: z.literal(false),
    reconnectable: z.literal(false),
    roomCode: roomCodeSchema,
    reason: z.literal("not_found"),
  }).strict(),
  z.object({
    exists: z.literal(true),
    joinable: z.boolean(),
    reconnectable: z.boolean(),
    roomCode: roomCodeSchema,
    reason: RoomInviteUnavailableReasonSchema.nullable(),
    playerCount: z.number().int().min(0).max(MAX_MULTIPLAYER_PLAYERS),
    maxPlayers: z.literal(MAX_MULTIPLAYER_PLAYERS),
    settings: RoomInviteSettingsSchema,
  }).strict(),
]);

export type RoomInvitePreview = z.infer<typeof RoomInvitePreviewSchema>;
export type RoomInviteUnavailableReason = z.infer<typeof RoomInviteUnavailableReasonSchema>;
