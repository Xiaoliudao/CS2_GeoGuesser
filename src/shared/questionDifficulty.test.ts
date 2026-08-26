import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY_POOL,
  DifficultyPoolSchema,
  normalizeDifficultyPool,
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_CHINESE_LABELS,
  QUESTION_DIFFICULTY_LABELS,
  QuestionDifficultySchema,
} from "./questionDifficulty";

describe("question difficulty", () => {
  it("defines exactly EASY, HARD, and HELL in canonical order", () => {
    expect(QUESTION_DIFFICULTIES).toEqual(["easy", "hard", "hell"]);
    expect(QUESTION_DIFFICULTY_LABELS).toEqual({ easy: "EASY", hard: "HARD", hell: "HELL" });
    expect(QUESTION_DIFFICULTY_CHINESE_LABELS).toEqual({ easy: "简单", hard: "困难", hell: "地狱" });
    expect(DEFAULT_DIFFICULTY_POOL).toEqual(QUESTION_DIFFICULTIES);
    expect(DEFAULT_DIFFICULTY_POOL).not.toBe(QUESTION_DIFFICULTIES);
  });

  it.each(QUESTION_DIFFICULTIES)("accepts the canonical %s question difficulty", (difficulty) => {
    expect(QuestionDifficultySchema.parse(difficulty)).toBe(difficulty);
  });

  it.each(["medium", "normal", "expert", "insane", "", null, undefined])(
    "rejects a non-canonical difficulty: %s",
    (difficulty) => {
      expect(QuestionDifficultySchema.safeParse(difficulty).success).toBe(false);
    },
  );

  it("requires a non-empty, unique difficulty pool", () => {
    expect(DifficultyPoolSchema.safeParse([]).success).toBe(false);
    expect(DifficultyPoolSchema.safeParse(["easy", "easy"]).success).toBe(false);
    expect(DifficultyPoolSchema.safeParse(["easy", "medium"]).success).toBe(false);
    expect(DifficultyPoolSchema.safeParse("easy").success).toBe(false);
  });

  it("normalizes valid pools to canonical order without mutating the input", () => {
    const input = ["hell", "easy"] as const;
    expect(normalizeDifficultyPool(input)).toEqual(["easy", "hell"]);
    expect(input).toEqual(["hell", "easy"]);
    expect(normalizeDifficultyPool(["hard"])).toEqual(["hard"]);
    expect(normalizeDifficultyPool(["hell", "hard", "easy"])).toEqual(QUESTION_DIFFICULTIES);
  });
});
