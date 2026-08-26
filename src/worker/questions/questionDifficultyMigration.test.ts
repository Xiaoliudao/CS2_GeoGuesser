import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../migrations/0003_questions_difficulty.sql", import.meta.url),
  "utf8",
);

describe("question difficulty D1 migration", () => {
  it("backfills existing rows to hard with a database constraint", () => {
    expect(migration).toMatch(
      /ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'hard'\s+CHECK \(difficulty IN \('easy', 'hard', 'hell'\)\)/,
    );
  });

  it("is additive and creates the enabled/map/difficulty selection index", () => {
    expect(migration).not.toMatch(/\b(?:DROP|DELETE|REPLACE)\b/i);
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS questions_enabled_map_difficulty_idx\s+ON questions \(enabled, map_id, difficulty\)/,
    );
  });
});
