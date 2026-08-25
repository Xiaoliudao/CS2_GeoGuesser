// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOLO_SETTINGS, type SoloSessionState } from "../../shared/solo";
import { storeSoloSessionId } from "../lib/soloSessionStorage";
import { useSoloSession } from "./useSoloSession";

const SESSION_ID = "b".repeat(64);

function state(overrides: Partial<SoloSessionState> = {}): SoloSessionState {
  return {
    sessionId: SESSION_ID,
    generation: 3,
    nickname: "Tester",
    status: "playing",
    settings: { ...DEFAULT_SOLO_SETTINGS, mapPool: [...DEFAULT_SOLO_SETTINGS.mapPool] },
    round: 2,
    questionCount: 50,
    currentQuestion: { questionId: "opaque-question", imageUrl: "/media/questions/opaque-question" },
    nextQuestion: null,
    roundStartedAt: 1_000,
    roundEndsAt: 21_000,
    hintUsed: false,
    hintMapId: null,
    roundResult: null,
    results: [],
    totalScore: 0,
    assetOrigin: "",
    stateVersion: 4,
    serverNow: 2_000,
    ...overrides,
  };
}

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function Harness() {
  const solo = useSoloSession();
  return (
    <div>
      <span>{solo.restoring ? "RESTORING" : solo.state?.status ?? "EMPTY"}</span>
      <span>{solo.state?.hintMapId ?? "NO HINT"}</span>
      <button type="button" onClick={() => solo.state && void solo.requestHint(solo.state.round)}>HINT</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  storeSoloSessionId(SESSION_ID);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSoloSession", () => {
  it("restores through HTTP without a WebSocket and sends generation-bound hint requests", async () => {
    const websocket = vi.fn();
    vi.stubGlobal("WebSocket", websocket);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/solo/${SESSION_ID}`) return response(state());
      if (url === `/api/solo/${SESSION_ID}/hint`) return response(state({ hintUsed: true, hintMapId: "mirage", stateVersion: 5 }));
      throw new Error(`Unexpected request ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(screen.getByText("playing")).toBeTruthy());
    expect(websocket).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "HINT" }));
    await waitFor(() => expect(screen.getByText("mirage")).toBeTruthy());

    const hintCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/hint"));
    expect(hintCall).toBeTruthy();
    expect(JSON.parse(String(hintCall![1]?.body))).toEqual({ generation: 3, round: 2 });
  });
});
