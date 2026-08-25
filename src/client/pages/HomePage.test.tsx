// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_IDS } from "../../shared/maps";
import { DEFAULT_ROOM_SETTINGS } from "../../shared/roomSettings";
import {
  MATCH_SETTINGS_AVAILABILITY_ID,
  MATCH_SETTINGS_DETAILS_ID,
  MATCH_SETTINGS_DURATION_INPUT_ID,
  MATCH_SETTINGS_MAP_POOL_ID,
  MATCH_SETTINGS_ROUNDS_INPUT_ID,
} from "../components/MatchSettingsPanel";
import { HomePage } from "./HomePage";

interface FetchScenario {
  availableQuestions?: number;
  createStatus?: number;
  createBody?: Record<string, unknown>;
  previewBody?: Record<string, unknown>;
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function installFetch({
  availableQuestions = 61,
  createStatus = 200,
  createBody = { roomCode: "ABCDE" },
  previewBody = {
    exists: true,
    joinable: true,
    reconnectable: false,
    roomCode: "87MDB",
    reason: null,
    playerCount: 1,
    maxPlayers: 5,
    settings: { totalRounds: 5, roundDurationSeconds: 20, mapCount: 8, serverRegion: "auto" },
  },
}: FetchScenario = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/questions/availability") {
      return response(200, { availableQuestions, byMap: {} });
    }
    if (url === "/api/rooms") return response(createStatus, createBody);
    if (url === "/api/rooms/87MDB/preview") return response(200, previewBody);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function roomCreateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === "/api/rooms");
}

async function waitForAvailability() {
  const createButton = screen.getByRole("button", { name: "CREATE MULTIPLAYER ROOM" });
  await waitFor(() => expect(createButton.getAttribute("aria-disabled")).toBe("false"));
  return createButton;
}

async function openMultiplayer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "MULTIPLAYER" }));
  const heading = screen.getByRole("heading", { name: "ROOM SETTINGS" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  localStorage.setItem("cs2-guesser-nickname", "Tester");
  localStorage.setItem("cs2-guesser-player-id", "11111111-1111-4111-8111-111111111111");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HomePage compact room creation", () => {
  it("initially shows only the three mode actions and defers every setup form", () => {
    const fetchMock = installFetch();
    render(<HomePage />);

    const modes = screen.getByRole("group", { name: "Game modes" });
    expect(within(modes).getAllByRole("button")).toHaveLength(3);
    expect(within(modes).getByRole("button", { name: "SINGLE PLAYER" })).toBeTruthy();
    expect(within(modes).getByRole("button", { name: "MULTIPLAYER" })).toBeTruthy();
    expect(within(modes).getByRole("button", { name: "JOIN ROOM" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "ROOM SETTINGS" })).toBeNull();
    expect(screen.queryByLabelText("ROOM CODE")).toBeNull();
    expect(screen.queryByRole("button", { name: "CREATE MULTIPLAYER ROOM" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the separate solo route without creating a multiplayer room", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "SINGLE PLAYER" }));

    expect(window.location.pathname).toBe("/solo");
    expect(roomCreateCalls(fetchMock)).toHaveLength(0);
  });

  it("creates with exact defaults without opening advanced settings", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);
    await openMultiplayer(user);
    const details = document.getElementById(MATCH_SETTINGS_DETAILS_ID) as HTMLDivElement;
    const createButton = await waitForAvailability();

    expect(details.hidden).toBe(true);
    await user.click(createButton);

    await waitFor(() => expect(roomCreateCalls(fetchMock)).toHaveLength(1));
    const [, init] = roomCreateCalls(fetchMock)[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      settings: { ...DEFAULT_ROOM_SETTINGS, mapPool: [...MAP_IDS] },
      creator: {
        playerId: "11111111-1111-4111-8111-111111111111",
        nickname: "Tester",
      },
    });
    expect(details.hidden).toBe(true);
  });

  it("blocks invalid rounds, expands settings, and focuses the invalid input", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);
    await openMultiplayer(user);
    await waitForAvailability();

    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));
    const input = document.getElementById(MATCH_SETTINGS_ROUNDS_INPUT_ID) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "HIDE SETTINGS" }));
    await user.click(screen.getByRole("button", { name: "CREATE MULTIPLAYER ROOM" }));

    await waitFor(() => expect(document.activeElement).toBe(input));
    expect((document.getElementById(MATCH_SETTINGS_DETAILS_ID) as HTMLDivElement).hidden).toBe(false);
    expect(roomCreateCalls(fetchMock)).toHaveLength(0);
  });

  it("blocks an invalid timer and focuses its custom input", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);
    await openMultiplayer(user);
    await waitForAvailability();

    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));
    const input = document.getElementById(MATCH_SETTINGS_DURATION_INPUT_ID) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "9");
    await user.click(screen.getByRole("button", { name: "HIDE SETTINGS" }));
    await user.click(screen.getByRole("button", { name: "CREATE MULTIPLAYER ROOM" }));

    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(roomCreateCalls(fetchMock)).toHaveLength(0);
  });

  it("blocks an empty map pool and focuses the map controls", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);
    await openMultiplayer(user);
    await waitForAvailability();

    await user.click(screen.getByRole("button", { name: "CUSTOMIZE MATCH" }));
    await user.click(screen.getByRole("button", { name: "CLEAR" }));
    await user.click(screen.getByRole("button", { name: "HIDE SETTINGS" }));
    await user.click(screen.getByRole("button", { name: "CREATE MULTIPLAYER ROOM" }));

    const mapPool = document.getElementById(MATCH_SETTINGS_MAP_POOL_ID);
    await waitFor(() => expect(document.activeElement).toBe(mapPool));
    expect(roomCreateCalls(fetchMock)).toHaveLength(0);
  });

  it("blocks a question shortage from collapsed defaults and focuses its message", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({ availableQuestions: 4 });
    render(<HomePage />);
    await openMultiplayer(user);
    const createButton = screen.getByRole("button", { name: "CREATE MULTIPLAYER ROOM" });
    await waitFor(() => expect(document.querySelector(".match-settings-note")?.textContent).toContain("ONLY 4 QUESTIONS ARE AVAILABLE"));

    await user.click(createButton);

    const availability = document.getElementById(MATCH_SETTINGS_AVAILABILITY_ID);
    await waitFor(() => expect(document.activeElement).toBe(availability));
    expect(roomCreateCalls(fetchMock)).toHaveLength(0);
  });

  it("shows a server database error inside the focused settings panel", async () => {
    const user = userEvent.setup();
    const message = "The question database is temporarily unavailable. Please try again.";
    installFetch({
      createStatus: 503,
      createBody: { error: "QUESTION_DATABASE_UNAVAILABLE" },
    });
    render(<HomePage />);
    await openMultiplayer(user);
    const createButton = await waitForAvailability();

    await user.click(createButton);

    const availability = document.getElementById(MATCH_SETTINGS_AVAILABILITY_ID) as HTMLDivElement;
    await waitFor(() => expect(document.activeElement).toBe(availability));
    expect(availability.textContent).toContain(message);
    expect(availability.textContent).not.toContain("61 QUESTIONS AVAILABLE");
  });

  it("keeps manual room-code joining as a fallback through the shared join action", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);
    await user.click(screen.getByRole("button", { name: "JOIN ROOM" }));

    await user.type(screen.getByLabelText("ROOM CODE"), "87mdb");
    await user.click(screen.getByRole("button", { name: "JOIN ROOM" }));

    await waitFor(() => expect(window.location.pathname).toBe("/room/87MDB"));
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/rooms/87MDB/preview")).toBe(true);
  });

  it("returns from deferred multiplayer settings to the three mode actions", async () => {
    const user = userEvent.setup();
    installFetch();
    render(<HomePage />);

    await openMultiplayer(user);
    await user.click(screen.getByRole("button", { name: "← BACK" }));

    const modes = screen.getByRole("group", { name: "Game modes" });
    expect(within(modes).getAllByRole("button")).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "MULTIPLAYER" })));
    expect(screen.queryByRole("heading", { name: "ROOM SETTINGS" })).toBeNull();
  });

  it("returns from the join form and restores focus to its mode action", async () => {
    const user = userEvent.setup();
    installFetch();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "JOIN ROOM" }));
    expect(document.activeElement).toBe(screen.getByLabelText("ROOM CODE"));
    await user.click(screen.getByRole("button", { name: "← BACK" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "JOIN ROOM" })));
    expect(screen.queryByLabelText("ROOM CODE")).toBeNull();
  });

  it("keeps all setup flows hidden until the nickname is valid", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    render(<HomePage />);

    await user.clear(screen.getByLabelText("NICKNAME"));
    await user.click(screen.getByRole("button", { name: "MULTIPLAYER" }));

    expect(screen.getByRole("alert").textContent).toContain("Nickname must be between 2 and 20 characters");
    expect(screen.getByRole("group", { name: "Game modes" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "ROOM SETTINGS" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
