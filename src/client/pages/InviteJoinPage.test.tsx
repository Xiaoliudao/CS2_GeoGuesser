// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { QUESTION_DIFFICULTIES } from "../../shared/questionDifficulty";
import { InviteJoinPage } from "./InviteJoinPage";

const validPreview = {
  exists: true,
  joinable: true,
  reconnectable: false,
  roomCode: "87MDB",
  reason: null,
  playerCount: 1,
  maxPlayers: 5,
  settings: {
    totalRounds: 5,
    roundDurationSeconds: 20,
    mapCount: 8,
    difficultyPool: [...QUESTION_DIFFICULTIES],
    serverRegion: "auto",
  },
};

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  localStorage.setItem("cs2-guesser-player-id", "11111111-1111-4111-8111-111111111111");
  document.head.innerHTML = '<meta name="robots" content="index, follow">';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("room invite join page", () => {
  it("routes lowercase direct links to the dedicated nickname form", async () => {
    window.history.replaceState({}, "", "/join/87mdb");
    vi.stubGlobal("fetch", vi.fn(async () => response(200, validPreview)));
    render(<App />);

    expect(screen.getByText("CHECKING ROOM…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("YOU'VE BEEN INVITED")).toBeTruthy());
    expect(screen.getByText("87MDB")).toBeTruthy();
    expect(screen.getByText("5 ROUNDS")).toBeTruthy();
    expect(screen.getByText("20 SEC")).toBeTruthy();
    expect(screen.getByText("1 / 5 PLAYERS")).toBeTruthy();
    expect(screen.getByText("ALL DIFFICULTIES")).toBeTruthy();
    expect(window.location.pathname).toBe("/join/87MDB");
    expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe("noindex, nofollow");
  });

  it("joins the exact room through the shared join action", async () => {
    localStorage.setItem("cs2-guesser-nickname", "Fred");
    const fetchMock = vi.fn(async () => response(200, validPreview));
    vi.stubGlobal("fetch", fetchMock);
    render(<InviteJoinPage roomCode="87MDB" />);
    await waitFor(() => expect(screen.getByText("YOU'VE BEEN INVITED")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "JOIN ROOM" }));
    await waitFor(() => expect(window.location.pathname).toBe("/room/87MDB"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps join disabled until a valid nickname is entered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, validPreview)));
    render(<InviteJoinPage roomCode="87MDB" />);
    await waitFor(() => expect(screen.getByText("YOU'VE BEEN INVITED")).toBeTruthy());

    expect((screen.getByRole("button", { name: "JOIN ROOM" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows only a server-recognized existing player to reconnect", async () => {
    localStorage.setItem("cs2-guesser-nickname", "Fred");
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...validPreview, reconnectable: true })));
    render(<InviteJoinPage roomCode="87MDB" />);

    expect(await screen.findByText("WELCOME BACK")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RECONNECT TO ROOM" })).toBeTruthy();
  });

  it("shows an explicit invalid-room state without contacting a Durable Object", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<InviteJoinPage roomCode="bad" />);

    expect(await screen.findByText("ROOM NOT FOUND")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["full", "ROOM FULL"],
    ["in_progress", "MATCH IN PROGRESS"],
    ["expired", "INVITE EXPIRED"],
  ] as const)("shows %s rooms as %s", async (reason, title) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, {
      ...validPreview,
      joinable: false,
      reason,
      playerCount: reason === "full" ? 5 : 1,
    })));
    render(<InviteJoinPage roomCode="87MDB" />);

    expect(await screen.findByText(title)).toBeTruthy();
    if (reason === "full") expect(screen.getByText("This room already has 5 players.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "JOIN ROOM" })).toBeNull();
  });
});
