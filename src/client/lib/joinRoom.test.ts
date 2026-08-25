// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinRoom } from "./joinRoom";

const validPreview = {
  exists: true,
  joinable: true,
  reconnectable: false,
  roomCode: "87MDB",
  reason: null,
  playerCount: 1,
  maxPlayers: 5,
  settings: { totalRounds: 5, roundDurationSeconds: 20, mapCount: 8, serverRegion: "auto" },
};

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("cs2-guesser-player-id", "11111111-1111-4111-8111-111111111111");
});

afterEach(() => vi.unstubAllGlobals());

describe("shared room join action", () => {
  it("normalizes lowercase and validates the exact room through preview", async () => {
    const fetchMock = vi.fn(async () => response(200, validPreview));
    vi.stubGlobal("fetch", fetchMock);

    await expect(joinRoom({ roomCode: "87mdb", nickname: "Fred" })).resolves.toEqual({
      ok: true,
      roomCode: "87MDB",
      reconnecting: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms/87MDB/preview", expect.objectContaining({
      headers: expect.objectContaining({ "x-cs2-player-id": "11111111-1111-4111-8111-111111111111" }),
    }));
  });

  it("rejects missing nicknames without contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await joinRoom({ roomCode: "87MDB", nickname: "" });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces authoritative full and started states", async () => {
    const full = { ...validPreview, joinable: false, reason: "full", playerCount: 5 };
    vi.stubGlobal("fetch", vi.fn(async () => response(200, full)));
    expect(await joinRoom({ roomCode: "87MDB", nickname: "Fred" })).toMatchObject({ ok: false, code: "full" });

    const started = { ...validPreview, joinable: false, reason: "in_progress" };
    vi.stubGlobal("fetch", vi.fn(async () => response(200, started)));
    expect(await joinRoom({ roomCode: "87MDB", nickname: "Fred" })).toMatchObject({ ok: false, code: "in_progress" });
  });
});
