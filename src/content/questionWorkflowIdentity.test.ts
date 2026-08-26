import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  difficultyOverridesPath,
  overridesPath,
  previewIdentityAliases,
  requireQuestionDifficultyForPublish,
} from "../../scripts/content/question-workflow";
import type { PreviewQuestion } from "./questionPreview";

function preview(previewId: string, relativeSourcePath: string, hash: string): PreviewQuestion {
  const legacyPreviewId = relativeSourcePath.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? previewId;
  return {
    previewId,
    legacyPreviewId,
    sourceFile: relativeSourcePath.split("/").at(-1) ?? relativeSourcePath,
    relativeSourcePath,
    sourceImageSha256: hash,
    mapId: previewId.startsWith("inferno/") ? "inferno" : "mirage",
    layerId: "main",
    worldPosition: { x: 1, y: 2, z: 3 },
    automaticPoint: { x: 0.25, y: 0.75 },
    screenshotUrl: `/__dev_assets__/questions/${relativeSourcePath}`,
    radarUrl: "/__dev_assets__/radars/mirage/main.webp",
    coordinateSource: "world-conversion",
  };
}

describe("nested question workflow identity", () => {
  it("keeps a unique legacy preview id compatible after moving a question into a map folder", () => {
    const nested = preview("mirage/mirage-01", "Mirage/mirage-01.jpg", "a".repeat(64));
    expect(previewIdentityAliases(nested, [nested])).toEqual(["mirage/mirage-01", "mirage-01"]);
  });

  it("does not reuse an ambiguous legacy id across map folders", () => {
    const mirage = preview("mirage/shared", "Mirage/shared.jpg", "a".repeat(64));
    const inferno = preview("inferno/shared", "Inferno/shared.jpg", "b".repeat(64));
    expect(previewIdentityAliases(mirage, [mirage, inferno])).toEqual(["mirage/shared"]);
    expect(previewIdentityAliases(inferno, [mirage, inferno])).toEqual(["inferno/shared"]);
  });

  it("enforces unique non-null source preview ids in D1", () => {
    const migration = readFileSync(
      resolve(import.meta.dirname, "..", "..", "migrations", "0002_questions_source_preview_id.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS questions_source_preview_id_unique_idx");
    expect(migration).toContain("WHERE source_preview_id IS NOT NULL");
  });
});

describe("question difficulty publish boundary", () => {
  it.each(["easy", "hard", "hell"] as const)("accepts canonical %s difficulty", (difficulty) => {
    expect(requireQuestionDifficultyForPublish(difficulty)).toBe(difficulty);
  });

  it.each([undefined, null, ""])("requires an explicit difficulty for new publication", (difficulty) => {
    expect(() => requireQuestionDifficultyForPublish(difficulty)).toThrow("SELECT_A_DIFFICULTY");
  });

  it.each(["medium", "normal", "expert", [], {}])("rejects invalid difficulty %j", (difficulty) => {
    expect(() => requireQuestionDifficultyForPublish(difficulty)).toThrow("INVALID_DIFFICULTY");
  });

  it("persists difficulty separately from coordinate overrides", () => {
    expect(difficultyOverridesPath).not.toBe(overridesPath);
    expect(difficultyOverridesPath).toMatch(/question-difficulty-overrides\.json$/);
    expect(overridesPath).toMatch(/question-overrides\.json$/);
  });
});
