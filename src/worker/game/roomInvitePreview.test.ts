import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import { RoomInvitePreviewSchema } from "../../shared/roomInvite";
import { missingRoomInvitePreview, roomInvitePreview } from "./roomInvitePreview";

const base = {
  roomCode: "87MDB",
  settings: DEFAULT_ROOM_SETTINGS,
  playerIds: ["player-a"],
  viewerPlayerId: "visitor",
};

describe("safe room invite preview", () => {
  it("returns only public join-page fields for a waiting room", () => {
    const preview = roomInvitePreview({ ...base, status: "waiting" });

    expect(RoomInvitePreviewSchema.safeParse(preview).success).toBe(true);
    expect(preview).toEqual({
      exists: true,
      joinable: true,
      reconnectable: false,
      roomCode: "87MDB",
      reason: null,
      playerCount: 1,
      maxPlayers: 2,
      settings: {
        totalRounds: DEFAULT_ROOM_SETTINGS.totalRounds,
        roundDurationSeconds: DEFAULT_ROOM_SETTINGS.roundDurationSeconds,
        mapCount: DEFAULT_ROOM_SETTINGS.mapPool.length,
        serverRegion: DEFAULT_ROOM_SETTINGS.serverRegion,
      },
    });
    expect(JSON.stringify(preview)).not.toMatch(/correctPoint|question|playerIds|nickname|token/i);
  });

  it("blocks strangers when full or playing", () => {
    expect(roomInvitePreview({ ...base, status: "waiting", playerIds: ["a", "b"] })).toMatchObject({ joinable: false, reason: "full" });
    expect(roomInvitePreview({ ...base, status: "playing" })).toMatchObject({ joinable: false, reason: "in_progress" });
  });

  it("allows only an existing player to reconnect to an active match", () => {
    expect(roomInvitePreview({ ...base, status: "playing", viewerPlayerId: "player-a" })).toMatchObject({
      joinable: true,
      reconnectable: true,
      reason: null,
    });
  });

  it("marks finished and missing rooms as expired or not found", () => {
    expect(roomInvitePreview({ ...base, status: "finished" })).toMatchObject({ joinable: false, reason: "expired" });
    expect(missingRoomInvitePreview("87MDB")).toEqual({
      exists: false,
      joinable: false,
      reconnectable: false,
      roomCode: "87MDB",
      reason: "not_found",
    });
  });
});
