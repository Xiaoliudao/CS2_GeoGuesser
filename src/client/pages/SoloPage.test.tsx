// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOLO_SETTINGS, type SoloSessionState } from "../../shared/solo";
import { SoloPage } from "./SoloPage";

const SESSION_ID = "d".repeat(64);

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("cs2-guesser-nickname", "Tester");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SoloPage setup", () => {
  it("starts the separate HTTP solo session with exact defaults and no room or WebSocket", async () => {
    const completed: SoloSessionState = {
      sessionId: SESSION_ID,
      generation: 1,
      nickname: "Tester",
      status: "finished",
      settings: { ...DEFAULT_SOLO_SETTINGS, mapPool: [...DEFAULT_SOLO_SETTINGS.mapPool] },
      round: 5,
      questionCount: 100,
      currentQuestion: null,
      nextQuestion: null,
      roundStartedAt: null,
      roundEndsAt: null,
      hintUsed: false,
      hintMapId: null,
      roundResult: null,
      results: [],
      totalScore: 0,
      assetOrigin: "",
      stateVersion: 1,
      serverNow: Date.now(),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/questions/availability") return response(200, { availableQuestions: 100, byMap: {} });
      if (url === "/api/solo") return response(201, completed);
      throw new Error(`Unexpected request: ${url}`);
    });
    const websocket = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", websocket);
    const user = userEvent.setup();
    render(<SoloPage />);

    const start = screen.getByRole("button", { name: "START SINGLE PLAYER" });
    await waitFor(() => expect(start.getAttribute("aria-disabled")).toBe("false"));
    await user.click(start);
    await waitFor(() => expect(screen.getByText("SESSION COMPLETE")).toBeTruthy());

    const startCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/solo");
    const availabilityCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/questions/availability");
    expect(startCall).toBeTruthy();
    expect(JSON.parse(String(availabilityCall![1]?.body))).toEqual({
      mapPool: DEFAULT_SOLO_SETTINGS.mapPool,
      difficultyPool: DEFAULT_SOLO_SETTINGS.difficultyPool,
    });
    expect(JSON.parse(String(startCall![1]?.body))).toEqual({ nickname: "Tester", settings: DEFAULT_SOLO_SETTINGS });
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/rooms")).toBe(false);
    expect(websocket).not.toHaveBeenCalled();
  });
});
