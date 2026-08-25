import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_SETTINGS,
  CreateRoomRequestSchema,
  RoomSettingsSchema,
  roomSettingsValidationErrorCode,
  roundDeadline,
  roundDurationMs,
  roomSettingsFromStorage,
} from "./roomSettings";

describe("RoomSettings validation", () => {
  it("accepts defaults, custom values, a single map, and all maps", () => {
    expect(RoomSettingsSchema.parse(DEFAULT_ROOM_SETTINGS)).toEqual(DEFAULT_ROOM_SETTINGS);
    expect(RoomSettingsSchema.parse({
      totalRounds: 25,
      roundDurationSeconds: 60,
      mapPool: ["mirage"],
      serverRegion: "asia",
    })).toEqual({ totalRounds: 25, roundDurationSeconds: 60, mapPool: ["mirage"], serverRegion: "asia" });
    expect(RoomSettingsSchema.parse({
      totalRounds: 50,
      roundDurationSeconds: 120,
      mapPool: ["overpass", "mirage", "dust2"],
      serverRegion: "auto",
    }).mapPool).toEqual(["mirage", "dust2", "overpass"]);
  });

  it.each([
    { totalRounds: 0, roundDurationSeconds: 20, mapPool: ["mirage"] },
    { totalRounds: 51, roundDurationSeconds: 20, mapPool: ["mirage"] },
    { totalRounds: 1.5, roundDurationSeconds: 20, mapPool: ["mirage"] },
    { totalRounds: 5, roundDurationSeconds: 9, mapPool: ["mirage"] },
    { totalRounds: 5, roundDurationSeconds: 121, mapPool: ["mirage"] },
    { totalRounds: 5, roundDurationSeconds: 10.5, mapPool: ["mirage"] },
    { totalRounds: 5, roundDurationSeconds: 20, mapPool: [] },
    { totalRounds: 5, roundDurationSeconds: 20, mapPool: ["cache"] },
    { totalRounds: 5, roundDurationSeconds: 20, mapPool: ["mirage", "mirage"] },
    { totalRounds: 5, roundDurationSeconds: 20, mapPool: ["mirage"], serverRegion: "europe" },
  ])("rejects malformed settings %#", (settings) => {
    expect(RoomSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("migrates legacy rounds and otherwise uses independent defaults", () => {
    const migrated = roomSettingsFromStorage(undefined, 15);
    expect(migrated).toEqual({ ...DEFAULT_ROOM_SETTINGS, totalRounds: 15 });
    expect(migrated.mapPool).not.toBe(DEFAULT_ROOM_SETTINGS.mapPool);
    expect(roomSettingsFromStorage(undefined, 0)).toEqual(DEFAULT_ROOM_SETTINGS);
  });

  it("derives a 45 second authoritative deadline duration", () => {
    expect(roundDurationMs({ roundDurationSeconds: 45 })).toBe(45_000);
    expect(roundDeadline(12_345, { roundDurationSeconds: 45 })).toBe(57_345);
  });

  it("requires the unified nested create-room protocol", () => {
    expect(CreateRoomRequestSchema.safeParse({ settings: DEFAULT_ROOM_SETTINGS }).success).toBe(true);
    expect(CreateRoomRequestSchema.safeParse({
      totalRounds: 5,
      roundDurationSeconds: 20,
      mapPool: ["mirage"],
    }).success).toBe(false);
  });

  it("returns stable server error codes for each invalid setting", () => {
    const cases = [
      [{ ...DEFAULT_ROOM_SETTINGS, totalRounds: 0 }, "INVALID_ROUND_COUNT"],
      [{ ...DEFAULT_ROOM_SETTINGS, roundDurationSeconds: 9 }, "INVALID_ROUND_DURATION"],
      [{ ...DEFAULT_ROOM_SETTINGS, mapPool: [] }, "EMPTY_MAP_POOL"],
      [{ ...DEFAULT_ROOM_SETTINGS, mapPool: ["cache"] }, "INVALID_MAP_ID"],
      [{ ...DEFAULT_ROOM_SETTINGS, serverRegion: "europe" }, "INVALID_SERVER_REGION"],
    ] as const;
    for (const [settings, code] of cases) {
      const result = RoomSettingsSchema.safeParse(settings);
      if (result.success) throw new Error("Expected invalid settings");
      expect(roomSettingsValidationErrorCode(result.error)).toBe(code);
    }
  });

  it.each(["create", "join", "ready", "playing", "reconnect", "round_result", "play_again"])(
    "preserves settings through a serialized %s state",
    (phase) => {
      const settings = RoomSettingsSchema.parse({
        totalRounds: 15,
        roundDurationSeconds: 30,
        mapPool: ["inferno", "mirage"],
        serverRegion: "asia",
      });
      const persisted = JSON.parse(JSON.stringify({ phase, settings })) as { settings: unknown };
      expect(roomSettingsFromStorage(persisted.settings)).toEqual({
        totalRounds: 15,
        roundDurationSeconds: 30,
        mapPool: ["mirage", "inferno"],
        serverRegion: "asia",
      });
      expect(persisted.settings).not.toHaveProperty("difficulty");
    },
  );
  });
