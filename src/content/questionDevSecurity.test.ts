import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { questionDevServerPlugin } from "../../scripts/content/question-dev-server";

describe("question publishing security boundary", () => {
  it("registers the mutation API only for the Vite development server", () => {
    expect(questionDevServerPlugin().apply).toBe("serve");
  });

  it("does not add preview or publishing endpoints to the production Worker", () => {
    const workerSource = readFileSync(resolve(import.meta.dirname, "..", "worker", "index.ts"), "utf8");
    expect(workerSource).not.toContain("__dev_api__");
    expect(workerSource).not.toContain("question-overrides.json");
    expect(workerSource).not.toContain("question-preview.json");
  });

  it("keeps the legacy answer manifest out of production Worker and client imports", () => {
    const questionsSource = readFileSync(resolve(import.meta.dirname, "..", "worker", "game", "questions.ts"), "utf8");
    const editorSource = readFileSync(resolve(import.meta.dirname, "..", "client", "pages", "QuestionEditorPage.tsx"), "utf8");
    expect(questionsSource).not.toContain("questionManifest.generated");
    expect(editorSource).not.toContain("question-manifest.json");
    expect(editorSource).not.toContain("questionManifest.generated");
  });
});
