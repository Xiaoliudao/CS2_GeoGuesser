// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminQuestion } from "../../shared/adminQuestions";
import { AdminQuestionEditorPage } from "./AdminQuestionEditorPage";

vi.mock("../components/RadarPicker", () => ({
  RadarPicker: ({ onChange, disabled }: { onChange: (point: { x: number; y: number }) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onChange({ x: 0.25, y: 0.75 })}>SET RADAR POINT</button>
  ),
}));

const baseQuestion: AdminQuestion = {
  id: "q-admin-page0001",
  mapId: "mirage",
  layerId: "main",
  difficulty: "hard",
  correctPoint: { x: 0.2, y: 0.8 },
  coordinateSource: "manual-override",
  enabled: true,
  contentHash: "admin-page-hash",
  sourcePreviewId: null,
  imageUrl: "/media/questions/q-admin-page0001",
  radarUrl: "/media/radars/mirage/main",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  const BrowserURL = URL;
  class MockURL extends BrowserURL {
    static createObjectURL = vi.fn(() => "blob:question-preview");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", MockURL);
});

describe("AdminQuestionEditorPage difficulty management", () => {
  it("requires one explicit difficulty and includes it in the upload form", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/admin/api/session") return jsonResponse(200, { email: "admin@example.com" });
      if (url === "/admin/api/questions" && !init?.method) return jsonResponse(200, { questions: [] });
      if (url === "/admin/api/questions" && init?.method === "POST") {
        const form = init.body as FormData;
        expect(form.get("difficulty")).toBe("easy");
        return jsonResponse(201, { question: { ...baseQuestion, difficulty: "easy" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminQuestionEditorPage />);

    const difficulty = await screen.findByRole("group", { name: "DIFFICULTY (REQUIRED)" });
    const submit = screen.getByRole("button", { name: "UPLOAD TO R2 + PUBLISH TO D1" }) as HTMLButtonElement;
    expect(within(difficulty).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("SELECT A DIFFICULTY")).toBeTruthy();

    await user.click(within(difficulty).getByRole("radio", { name: "EASY" }));
    await user.upload(
      screen.getByLabelText("QUESTION SCREENSHOT"),
      new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "question.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "SET RADAR POINT" }));
    expect(submit.disabled).toBe(false);
    fireEvent.submit(submit.closest("form") as HTMLFormElement);

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  });

  it("shows list difficulty and updates it immediately through metadata PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/admin/api/session") return jsonResponse(200, { email: "admin@example.com" });
      if (url === "/admin/api/questions") return jsonResponse(200, { questions: [baseQuestion] });
      if (url === "/admin/api/questions/q-admin-page0001/difficulty" && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ difficulty: "hell" });
        return jsonResponse(200, { question: { ...baseQuestion, difficulty: "hell" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminQuestionEditorPage />);

    expect(await screen.findByRole("option", { name: /HARD/ })).toBeTruthy();
    const difficulty = screen.getByRole("group", { name: "DIFFICULTY" });
    await user.click(within(difficulty).getByRole("radio", { name: "HELL" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/difficulty"))).toBe(true));
    expect(await screen.findByText("DIFFICULTY UPDATED TO HELL")).toBeTruthy();
    expect(screen.getByRole("option", { name: /HELL/ })).toBeTruthy();
  });
});
