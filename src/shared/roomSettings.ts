import { z } from "zod";
import { MAP_IDS, type MapId } from "./maps";

export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 50;
export const MIN_ROUND_DURATION_SECONDS = 10;
export const MAX_ROUND_DURATION_SECONDS = 120;

export const SERVER_REGIONS = ["auto", "asia"] as const;
export type ServerRegion = (typeof SERVER_REGIONS)[number];

export interface RoomSettings {
  totalRounds: number;
  roundDurationSeconds: number;
  mapPool: MapId[];
  serverRegion: ServerRegion;
}

export interface CreateRoomRequest {
  settings: RoomSettings;
}

export interface QuestionAvailability {
  availableQuestions: number;
  byMap: Partial<Record<MapId, number>>;
}

export type RoomSettingsValidationErrorCode =
  | "INVALID_ROOM_SETTINGS"
  | "INVALID_ROUND_COUNT"
  | "INVALID_ROUND_DURATION"
  | "EMPTY_MAP_POOL"
  | "INVALID_MAP_ID"
  | "INVALID_SERVER_REGION";

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  totalRounds: 5,
  roundDurationSeconds: 20,
  mapPool: [...MAP_IDS],
  serverRegion: "auto",
};

const MapIdSchema = z.enum(MAP_IDS);

export const MapPoolSchema = z
  .array(MapIdSchema)
  .min(1)
  .max(MAP_IDS.length)
  .superRefine((mapPool, context) => {
    if (new Set(mapPool).size !== mapPool.length) {
      context.addIssue({ code: "custom", message: "Map IDs must be unique." });
    }
  })
  .transform((mapPool) => MAP_IDS.filter((mapId) => mapPool.includes(mapId)));

export const RoomSettingsSchema = z.object({
  totalRounds: z.number().finite().int().min(MIN_ROUNDS).max(MAX_ROUNDS),
  roundDurationSeconds: z
    .number()
    .finite()
    .int()
    .min(MIN_ROUND_DURATION_SECONDS)
    .max(MAX_ROUND_DURATION_SECONDS),
  mapPool: MapPoolSchema,
  serverRegion: z.enum(SERVER_REGIONS),
}).strict();

export const CreateRoomRequestSchema = z.object({ settings: RoomSettingsSchema }).strict();
export const QuestionAvailabilityRequestSchema = z.object({ mapPool: MapPoolSchema }).strict();

export function roomSettingsValidationErrorCode(error: z.ZodError): RoomSettingsValidationErrorCode {
  const roundIssue = error.issues.find((issue) => issue.path.includes("totalRounds"));
  if (roundIssue) return "INVALID_ROUND_COUNT";
  const durationIssue = error.issues.find((issue) => issue.path.includes("roundDurationSeconds"));
  if (durationIssue) return "INVALID_ROUND_DURATION";
  const mapIssue = error.issues.find((issue) => issue.path.includes("mapPool"));
  if (mapIssue) {
    return mapIssue.code === "too_small" ? "EMPTY_MAP_POOL" : "INVALID_MAP_ID";
  }
  if (error.issues.some((issue) => issue.path.includes("serverRegion"))) return "INVALID_SERVER_REGION";
  return "INVALID_ROOM_SETTINGS";
}

export function roomSettingsFromStorage(rawSettings: unknown, legacyTotalRounds?: unknown): RoomSettings {
  const parsed = RoomSettingsSchema.safeParse(rawSettings);
  if (parsed.success) return parsed.data;
  if (rawSettings && typeof rawSettings === "object") {
    const migrated = RoomSettingsSchema.safeParse({ ...rawSettings, serverRegion: "auto" });
    if (migrated.success) return migrated.data;
  }
  const legacyRounds = typeof legacyTotalRounds === "number"
    && Number.isInteger(legacyTotalRounds)
    && legacyTotalRounds >= MIN_ROUNDS
    && legacyTotalRounds <= MAX_ROUNDS
    ? legacyTotalRounds
    : DEFAULT_ROOM_SETTINGS.totalRounds;
  return {
    ...DEFAULT_ROOM_SETTINGS,
    totalRounds: legacyRounds,
    mapPool: [...DEFAULT_ROOM_SETTINGS.mapPool],
  };
}

export function roundDurationMs(settings: Pick<RoomSettings, "roundDurationSeconds">): number {
  return settings.roundDurationSeconds * 1_000;
}

export function roundDeadline(roundStartedAt: number, settings: Pick<RoomSettings, "roundDurationSeconds">): number {
  return roundStartedAt + roundDurationMs(settings);
}
