import { describe, expect, it } from "vitest";
import { MAP_IDS } from "./maps";
import { DEFAULT_SOLO_SETTINGS, SoloGuessSchema, SoloSettingsSchema } from "./solo";

describe("solo settings", () => {
  it("defaults to five 20-second rounds across every map", () => {
    expect(DEFAULT_SOLO_SETTINGS).toEqual({
      totalRounds: 5,
      roundDurationSeconds: 20,
      mapPool: [...MAP_IDS],
    });
    expect(SoloSettingsSchema.safeParse(DEFAULT_SOLO_SETTINGS).success).toBe(true);
  });

  it("uses the same bounded gameplay settings without a multiplayer server region", () => {
    expect(SoloSettingsSchema.safeParse({
      totalRounds: 10,
      roundDurationSeconds: 30,
      mapPool: ["mirage", "nuke"],
    }).success).toBe(true);
    expect(SoloSettingsSchema.safeParse({
      totalRounds: 5,
      roundDurationSeconds: 20,
      mapPool: ["mirage"],
      serverRegion: "asia",
    }).success).toBe(false);
  });

  it("rejects a radar layer that does not belong to the guessed map", () => {
    expect(SoloGuessSchema.safeParse({
      generation: 1,
      round: 1,
      eventId: "ef2d4f4f-6006-4818-8ee3-e4929944663b",
      mapId: "mirage",
      layerId: "lower",
      point: { x: 0.25, y: 0.75 },
    }).success).toBe(false);
  });
});
