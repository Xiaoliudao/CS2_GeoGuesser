import { z } from "zod";

export const QUESTION_DIFFICULTIES = ["easy", "hard", "hell"] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const QUESTION_DIFFICULTY_LABELS: Readonly<Record<QuestionDifficulty, string>> = {
  easy: "EASY",
  hard: "HARD",
  hell: "HELL",
};

export const QUESTION_DIFFICULTY_CHINESE_LABELS: Readonly<Record<QuestionDifficulty, string>> = {
  easy: "简单",
  hard: "困难",
  hell: "地狱",
};

export const DEFAULT_DIFFICULTY_POOL: QuestionDifficulty[] = [...QUESTION_DIFFICULTIES];

export const QuestionDifficultySchema = z.enum(QUESTION_DIFFICULTIES);

export const DifficultyPoolSchema = z
  .array(QuestionDifficultySchema)
  .min(1)
  .max(QUESTION_DIFFICULTIES.length)
  .superRefine((difficultyPool, context) => {
    if (new Set(difficultyPool).size !== difficultyPool.length) {
      context.addIssue({ code: "custom", message: "Difficulty IDs must be unique." });
    }
  })
  .transform((difficultyPool) => QUESTION_DIFFICULTIES.filter((difficulty) => difficultyPool.includes(difficulty)));

export function normalizeDifficultyPool(input: unknown): QuestionDifficulty[] {
  return DifficultyPoolSchema.parse(input);
}
