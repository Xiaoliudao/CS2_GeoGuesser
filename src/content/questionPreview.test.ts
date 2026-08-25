import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { displayedPreviewPoint, getFinalQuestionPoint, getPreviewQuestionStatus, radarPreviewUrl, screenshotPreviewUrl, updateQuestionOverrides, type PreviewQuestion } from "./questionPreview";
import { copyQuestionPreviewAsset, copyRadarPreviewAsset, writeQuestionPreviewManifests } from "./questionPreviewWriter";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "cs2-question-preview-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

const question: PreviewQuestion = {
  previewId: "mirage-01",
  sourceFile: "mirage-01.jpg",
  mapId: "mirage",
  layerId: "main",
  worldPosition: { x: 1365.081055, y: -5.346069, z: -167.96875 },
  viewAngle: { pitch: 0, yaw: 49.440536, roll: 0 },
  automaticPoint: { x: 0.8974767685546875, y: 0.3356144666015625 },
  screenshotUrl: screenshotPreviewUrl("mirage-01.jpg"),
  radarUrl: radarPreviewUrl("mirage", "main"),
  coordinateSource: "world-conversion",
};

describe("development question previews", () => {
  it("writes the dry-run preview manifest and preserves the calculated point", () => {
    const root = temporaryDirectory();
    const generatedPath = join(root, "content", "generated", "question-preview.json");
    const publicPath = join(root, "public", "__dev_assets__", "question-preview.json");
    writeQuestionPreviewManifests([question], generatedPath, publicPath, "2026-08-24T00:00:00.000Z");
    for (const path of [generatedPath, publicPath]) {
      const saved = JSON.parse(readFileSync(path, "utf8")) as { questions: PreviewQuestion[] };
      expect(saved.questions[0].automaticPoint).toEqual(question.automaticPoint);
    }
  });

  it("generates and copies the expected screenshot and radar preview paths", () => {
    const root = temporaryDirectory();
    const screenshot = join(root, "mirage-01.jpg");
    const radar = join(root, "main.webp");
    writeFileSync(screenshot, "real screenshot fixture");
    writeFileSync(radar, "real radar fixture");
    expect(copyQuestionPreviewAsset(screenshot, join(root, "public", "__dev_assets__")))
      .toBe(join(root, "public", "__dev_assets__", "questions", "mirage-01.jpg"));
    expect(copyRadarPreviewAsset(radar, join(root, "public", "__dev_assets__"), "mirage", "main"))
      .toBe(join(root, "public", "__dev_assets__", "radars", "mirage", "main.webp"));
    expect(screenshotPreviewUrl("mirage-01.jpg")).toBe("/__dev_assets__/questions/mirage-01.jpg");
    expect(radarPreviewUrl("mirage", "main")).toBe("/__dev_assets__/radars/mirage/main.webp");
  });

  it("resets to the automatic point rather than the origin", () => {
    expect(displayedPreviewPoint(question.automaticPoint, { x: 0.1, y: 0.2 })).toEqual({ x: 0.1, y: 0.2 });
    expect(displayedPreviewPoint(question.automaticPoint, null)).toEqual(question.automaticPoint);
    expect(displayedPreviewPoint(question.automaticPoint, null)).not.toEqual({ x: 0, y: 0 });
  });

  it("uses one final-point rule for automatic and persisted manual answers", () => {
    expect(getFinalQuestionPoint({ automaticPoint: question.automaticPoint })).toEqual(question.automaticPoint);
    expect(getFinalQuestionPoint({ automaticPoint: question.automaticPoint, manualOverride: { x: 0.415, y: 0.396 } }))
      .toEqual({ x: 0.415, y: 0.396 });
  });

  it("reports the most important QA lifecycle state", () => {
    expect(getPreviewQuestionStatus({ hasOverride: false, isPending: false, isPublished: false })).toBe("preview");
    expect(getPreviewQuestionStatus({ hasOverride: true, isPending: false, isPublished: false })).toBe("overridden");
    expect(getPreviewQuestionStatus({ hasOverride: true, isPending: true, isPublished: false })).toBe("publish-pending");
    expect(getPreviewQuestionStatus({ hasOverride: true, isPending: true, isPublished: true })).toBe("published");
  });

  it("persists and resets a manual override without changing the automatic point", () => {
    const saved = updateQuestionOverrides({}, question.previewId, { x: 0.415485755, y: 0.395833015 });
    const refreshed = JSON.parse(JSON.stringify(saved)) as typeof saved;
    expect(getFinalQuestionPoint({ automaticPoint: question.automaticPoint, manualOverride: refreshed[question.previewId] }))
      .toEqual({ x: 0.415485755, y: 0.395833015 });
    const reset = updateQuestionOverrides(refreshed, question.previewId, null);
    expect(getFinalQuestionPoint({ automaticPoint: question.automaticPoint, manualOverride: reset[question.previewId] }))
      .toEqual(question.automaticPoint);
  });

  it("does not retain the fake query-preview fallback", () => {
    const editorSource = readFileSync(resolve(import.meta.dirname, "..", "client", "pages", "QuestionEditorPage.tsx"), "utf8");
    expect(editorSource).not.toContain("query-preview");
    expect(editorSource).not.toContain('automaticPoint: { x: 0, y: 0 }');
  });
});
