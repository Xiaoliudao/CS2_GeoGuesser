import { z } from "zod";
import { ASSET_LOAD_ERROR_REASONS, CLIENT_EVENTS } from "./protocol";
import { MAP_IDS, isLayerForMap } from "./maps";
import { multiplayerNicknameSchema, multiplayerPlayerIdSchema } from "./multiplayer";

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;

export const nicknameSchema = multiplayerNicknameSchema;
export const roomCodeSchema = z.string().trim().toUpperCase().regex(ROOM_CODE_PATTERN);
export const playerIdSchema = multiplayerPlayerIdSchema;

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(CLIENT_EVENTS.JOIN),
    payload: z.object({
      playerId: playerIdSchema,
      nickname: nicknameSchema,
    }),
  }),
  z.object({ type: z.literal(CLIENT_EVENTS.READY) }),
  z.object({ type: z.literal(CLIENT_EVENTS.START_MATCH) }).strict(),
  z.object({
    type: z.literal(CLIENT_EVENTS.GUESS_SUBMIT),
    payload: z.object({
      round: z.number().int().positive(),
      eventId: z.string().uuid(),
      mapId: z.enum(MAP_IDS),
      layerId: z.enum(["main", "upper", "lower"]),
      point: z.object({
        x: z.number().finite().min(0).max(1),
        y: z.number().finite().min(0).max(1),
      }),
    }),
  }).superRefine((event, context) => {
    if (!isLayerForMap(event.payload.mapId, event.payload.layerId)) {
      context.addIssue({ code: "custom", path: ["payload", "layerId"], message: "Layer is not valid for the selected map." });
    }
  }),
  z.object({ type: z.literal(CLIENT_EVENTS.SYNC) }),
  z.object({
    type: z.literal(CLIENT_EVENTS.PING),
    payload: z.union([
      z.object({ clientSentAt: z.number().finite() }).strict(),
      z.object({ sentAt: z.number().finite() }).strict(),
    ]),
  }),
  z.object({
    type: z.literal(CLIENT_EVENTS.ROUND_ASSET_READY),
    payload: z.object({
      round: z.number().int().positive(),
      questionId: z.string().min(1).max(100),
      loadMs: z.number().finite().int().min(0).max(120_000).optional(),
    }).strict(),
  }),
  z.object({
    type: z.literal(CLIENT_EVENTS.ROUND_ASSET_ERROR),
    payload: z.object({
      round: z.number().int().positive(),
      questionId: z.string().min(1).max(100),
      reason: z.enum(ASSET_LOAD_ERROR_REASONS),
    }).strict(),
  }),
  z.object({ type: z.literal(CLIENT_EVENTS.PLAY_AGAIN) }),
]);

export type ParsedClientEvent = z.infer<typeof clientEventSchema>;
