import { describe, expect, it } from "vitest";
import { createRoomInviteUrl, roomInviteShareText } from "./roomInvite";

describe("room invite URLs", () => {
  it("uses the current origin and normalized room code", () => {
    expect(createRoomInviteUrl("https://example.com", "87mdb")).toBe("https://example.com/join/87MDB");
  });

  it("contains only a room code and no player credentials", () => {
    const url = createRoomInviteUrl("https://example.com", "87MDB");
    expect(new URL(url).search).toBe("");
    expect(url).not.toContain("playerId");
    expect(url).not.toContain("token");
  });

  it("creates a short share message", () => {
    expect(roomInviteShareText("87MDB")).toBe("Join my CS2 Map Guesser room! Room: 87MDB");
  });
});
