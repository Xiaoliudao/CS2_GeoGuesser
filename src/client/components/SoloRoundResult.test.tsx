// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOLO_SETTINGS, type SoloSessionState } from "../../shared/solo";
import { SoloRoundResult } from "./SoloRoundResult";

afterEach(cleanup);

describe("SoloRoundResult", () => {
  it("shows only Correct and You with subtle hint metadata", () => {
    const roundResult = {
      round: 1,
      questionId: "question-one",
      correctMapId: "mirage" as const,
      correctLayerId: "main" as const,
      correctPoint: { x: 0.5, y: 0.5 },
      hintUsed: true,
      player: {
        playerId: "solo",
        nickname: "Tester",
        submitted: true,
        mapGuess: "mirage" as const,
        layerGuess: "main" as const,
        pointGuess: { x: 0.48, y: 0.49 },
        mapCorrect: true,
        layerCorrect: true,
        distance: 0.02,
        mapScore: 10,
        layerScore: 5,
        locationScore: 50,
        timeBonus: 10,
        elapsedMs: 10_000,
        points: 75,
      },
    };
    const session: SoloSessionState = {
      sessionId: "c".repeat(64),
      generation: 1,
      nickname: "Tester",
      status: "round_result",
      settings: { ...DEFAULT_SOLO_SETTINGS, mapPool: [...DEFAULT_SOLO_SETTINGS.mapPool] },
      round: 1,
      questionCount: 10,
      currentQuestion: { questionId: "question-one", imageUrl: "/media/questions/question-one" },
      nextQuestion: null,
      roundStartedAt: 1_000,
      roundEndsAt: 21_000,
      hintUsed: true,
      hintMapId: "mirage",
      roundResult,
      results: [roundResult],
      totalScore: 75,
      assetOrigin: "",
      stateVersion: 5,
      serverNow: 15_000,
    };

    render(<SoloRoundResult session={session} busy={false} onNext={vi.fn()} />);

    expect(screen.getByRole("img", { name: "Correct answer point" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Your guessed point" })).toBeTruthy();
    expect(screen.getByText("Y You")).toBeTruthy();
    expect(screen.queryByText(/Opponent/i)).toBeNull();
    expect(screen.getAllByText(/HINT USED/).length).toBeGreaterThan(0);
  });
});
