import { describe, expect, it } from "vitest";
import { DEFAULT_SOLO_SETTINGS } from "../../shared/solo";
import type { SoloGuess } from "../../shared/solo";
import type { ServerQuestion } from "../game/questions";
import { scoreGuess } from "../game/scoring";
import {
  advanceSoloRound,
  createInitialSoloState,
  prioritizeFreshQuestions,
  reconcileSoloState,
  revealSoloHint,
  startSoloRound,
  submitSoloGuess,
  toPublicSoloState,
} from "./soloState";

function question(
  id: string,
  mapId: ServerQuestion["correctMapId"] = "mirage",
  layerId: ServerQuestion["correctLayerId"] = "main",
): ServerQuestion {
  return {
    id,
    imageAssetKey: `questions/${id}.webp`,
    correctMapId: mapId,
    correctLayerId: layerId,
    correctPoint: { x: 0.625, y: 0.375 },
    worldPosition: { x: -2_331.54, y: -477.94, z: -63.24 },
    viewAngle: { pitch: -13.7, yaw: -145.67, roll: 0 },
    coordinateSource: "world-conversion",
  };
}

function state() {
  return createInitialSoloState({
    sessionId: "a".repeat(64),
    nickname: "Dr. Intel",
    settings: { ...DEFAULT_SOLO_SETTINGS, totalRounds: 2, mapPool: ["mirage", "nuke"] },
    questionCount: 10,
    questions: [question("question-solo-01"), question("question-solo-02", "nuke", "lower")],
  });
}

function guess(overrides: Partial<SoloGuess> = {}): SoloGuess {
  return {
    generation: 1,
    round: 1,
    eventId: "8fc76ec1-bc6c-4e5b-bda5-1dd0c74dbc65",
    mapId: "mirage",
    layerId: "main",
    point: { x: 0.62, y: 0.38 },
    ...overrides,
  };
}

describe("Solo server state", () => {
  it("publishes only opaque question media before a guess", () => {
    const publicState = toPublicSoloState(state(), "", 1_000);
    const serialized = JSON.stringify(publicState);

    expect(publicState.status).toBe("round_preparing");
    expect(publicState.currentQuestion).toEqual({
      questionId: "question-solo-01",
      imageUrl: "/media/questions/question-solo-01",
    });
    expect(publicState.hintMapId).toBeNull();
    expect(serialized).not.toContain("correctMapId");
    expect(serialized).not.toContain("correctLayerId");
    expect(serialized).not.toContain("correctPoint");
    expect(serialized).not.toContain("worldPosition");
    expect(serialized).not.toContain("viewAngle");
    expect(serialized).not.toContain("expiresAt");
  });

  it("starts the full authoritative duration only after readiness and never restarts it", () => {
    const solo = state();
    const first = startSoloRound(solo, {
      generation: 1,
      round: 1,
      questionId: "question-solo-01",
    }, 50_000);
    const deadline = solo.roundEndsAt;
    const repeated = startSoloRound(solo, {
      generation: 1,
      round: 1,
      questionId: "question-solo-01",
    }, 55_000);

    expect(first.ok).toBe(true);
    expect(deadline).toBe(70_000);
    expect(repeated).toMatchObject({ ok: true, changed: false });
    expect(solo.roundStartedAt).toBe(50_000);
    expect(solo.roundEndsAt).toBe(deadline);
  });

  it("reveals only the current map once and leaves the deadline untouched", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 10_000);
    const timingBefore = { started: solo.roundStartedAt, ends: solo.roundEndsAt };
    const hint = revealSoloHint(solo, 1, 1);
    const publicState = toPublicSoloState(solo, "", 11_000);
    const serialized = JSON.stringify(publicState);

    expect(hint).toMatchObject({ ok: true, value: { mapId: "mirage" } });
    expect(solo.roundStartedAt).toBe(timingBefore.started);
    expect(solo.roundEndsAt).toBe(timingBefore.ends);
    expect(publicState.hintMapId).toBe("mirage");
    expect(publicState.roundResult).toBeNull();
    expect(serialized).not.toContain("correctLayerId");
    expect(serialized).not.toContain("correctPoint");
    expect(serialized).not.toContain("worldPosition");
    expect(revealSoloHint(solo, 1, 1)).toMatchObject({ ok: false, error: "HINT_ALREADY_USED" });
  });

  it("rejects stale generation and round hint requests", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 10_000);
    expect(revealSoloHint(solo, 2, 1)).toMatchObject({ ok: false, error: "STALE_SESSION_GENERATION" });
    expect(revealSoloHint(solo, 1, 2)).toMatchObject({ ok: false, error: "STALE_ROUND" });
  });

  it("uses the existing server score and records an integer total", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 100_000);
    const payload = guess();
    const expected = scoreGuess(
      solo.questionSnapshot[0],
      payload.mapId,
      payload.layerId,
      payload.point,
      100_000,
      105_000,
      20_000,
    );
    const submitted = submitSoloGuess(solo, payload, 105_000);

    expect(submitted.ok).toBe(true);
    expect(solo.roundResult?.player).toMatchObject(expected);
    expect(solo.roundResult?.hintUsed).toBe(false);
    expect(solo.totalScore).toBe(expected.points);
    expect(Number.isInteger(solo.totalScore)).toBe(true);
    expect(revealSoloHint(solo, 1, 1)).toMatchObject({ ok: false, error: "INVALID_SOLO_STATE" });
  });

  it("makes duplicate submission events idempotent", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 100_000);
    const payload = guess();
    const first = submitSoloGuess(solo, payload, 101_000);
    const total = solo.totalScore;
    const duplicate = submitSoloGuess(solo, payload, 102_000);

    expect(first.ok).toBe(true);
    expect(duplicate).toMatchObject({ ok: true, changed: false });
    expect(solo.results).toHaveLength(1);
    expect(solo.totalScore).toBe(total);
  });

  it("never returns a later result for a delayed duplicate from an earlier round", () => {
    const solo = state();
    const firstPayload = guess();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 1_000);
    submitSoloGuess(solo, firstPayload, 2_000);
    advanceSoloRound(solo);
    startSoloRound(solo, { generation: 1, round: 2, questionId: "question-solo-02" }, 3_000);
    submitSoloGuess(solo, guess({
      round: 2,
      eventId: "326f65de-f033-49a8-bddb-8626f3a5219c",
      mapId: "nuke",
      layerId: "lower",
    }), 4_000);

    expect(submitSoloGuess(solo, firstPayload, 5_000)).toMatchObject({ ok: false, error: "STALE_ROUND" });
    expect(solo.roundResult?.round).toBe(2);
  });

  it("ends an expired round as NO GUESS without client timing input", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 20_000);

    expect(reconcileSoloState(solo, 39_999)).toBe(false);
    expect(reconcileSoloState(solo, 40_000)).toBe(true);
    expect(solo.status).toBe("round_result");
    expect(solo.roundResult?.player).toMatchObject({ submitted: false, points: 0, elapsedMs: null });
    expect(reconcileSoloState(solo, 41_000)).toBe(false);
  });

  it("keeps hint and timing data when stored state is restored", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 70_000);
    revealSoloHint(solo, 1, 1);
    const restored = JSON.parse(JSON.stringify(solo)) as typeof solo;
    const publicState = toPublicSoloState(restored, "", 75_000);

    expect(publicState.status).toBe("playing");
    expect(publicState.hintUsed).toBe(true);
    expect(publicState.hintMapId).toBe("mirage");
    expect(publicState.roundStartedAt).toBe(70_000);
    expect(publicState.roundEndsAt).toBe(90_000);
  });

  it("prepares the next unique question and finishes only after its result is acknowledged", () => {
    const solo = state();
    startSoloRound(solo, { generation: 1, round: 1, questionId: "question-solo-01" }, 1_000);
    submitSoloGuess(solo, guess(), 2_000);
    expect(advanceSoloRound(solo).ok).toBe(true);
    expect(solo).toMatchObject({ status: "round_preparing", round: 2, currentQuestionId: "question-solo-02" });

    startSoloRound(solo, { generation: 1, round: 2, questionId: "question-solo-02" }, 3_000);
    submitSoloGuess(solo, guess({
      round: 2,
      eventId: "326f65de-f033-49a8-bddb-8626f3a5219c",
      mapId: "nuke",
      layerId: "lower",
    }), 4_000);
    expect(solo.status).toBe("round_result");
    expect(advanceSoloRound(solo).ok).toBe(true);
    expect(solo.status).toBe("finished");
    expect(solo.results).toHaveLength(2);
    expect(solo.totalScore).toBe(solo.results.reduce((sum, result) => sum + result.player.points, 0));
  });

  it("prefers unseen play-again questions and falls back without duplicates", () => {
    const oldOne = question("old-1");
    const oldTwo = question("old-2");
    const freshOne = question("fresh-1");
    const freshTwo = question("fresh-2");

    expect(prioritizeFreshQuestions(
      [oldOne, freshOne, oldTwo, freshTwo],
      2,
      [oldOne.id, oldTwo.id],
    ).map((candidate) => candidate.id)).toEqual(["fresh-1", "fresh-2"]);
    expect(prioritizeFreshQuestions(
      [oldOne, freshOne, oldTwo, oldOne],
      3,
      [oldOne.id, oldTwo.id],
    ).map((candidate) => candidate.id)).toEqual(["fresh-1", "old-1", "old-2"]);
  });
});
