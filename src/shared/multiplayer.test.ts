import { describe, expect, it } from "vitest";
import {
  MAX_MULTIPLAYER_PLAYERS,
  MIN_MULTIPLAYER_PLAYERS,
  MultiplayerCreatorSchema,
} from "./multiplayer";

describe("multiplayer contract", () => {
  it("keeps the shared room bounds at two through five players", () => {
    expect(MIN_MULTIPLAYER_PLAYERS).toBe(2);
    expect(MAX_MULTIPLAYER_PLAYERS).toBe(5);
  });

  it("accepts only a strict UUID and normalized nickname for the creator", () => {
    const creator = {
      playerId: "11111111-1111-4111-8111-111111111111",
      nickname: "  Dr. INTEL  ",
    };
    expect(MultiplayerCreatorSchema.parse(creator)).toEqual({
      playerId: creator.playerId,
      nickname: "Dr. INTEL",
    });
    expect(MultiplayerCreatorSchema.safeParse({ ...creator, playerId: "player-one" }).success).toBe(false);
    expect(MultiplayerCreatorSchema.safeParse({ ...creator, nickname: "x" }).success).toBe(false);
    expect(MultiplayerCreatorSchema.safeParse({ ...creator, host: true }).success).toBe(false);
  });
});
