import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { MapId, RadarLayerId } from "../shared/maps";
import type { PreviewQuestion, QuestionPreviewManifest } from "./questionPreview";

function safeRelativeSegments(relativeSourcePath: string): string[] {
  const segments = relativeSourcePath.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("INVALID_PREVIEW_ASSET_PATH");
  }
  return segments;
}

export function copyQuestionPreviewAsset(
  sourcePath: string,
  publicDevAssetsRoot: string,
  relativeSourcePath = basename(sourcePath),
): string {
  const target = join(publicDevAssetsRoot, "questions", ...safeRelativeSegments(relativeSourcePath));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourcePath, target);
  return target;
}

export function copyRadarPreviewAsset(
  sourcePath: string,
  publicDevAssetsRoot: string,
  mapId: MapId,
  layerId: RadarLayerId,
): string {
  const target = join(publicDevAssetsRoot, "radars", mapId, `${layerId}.webp`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourcePath, target);
  return target;
}

export function writeQuestionPreviewManifests(
  questions: readonly PreviewQuestion[],
  generatedManifestPath: string,
  publicManifestPath: string,
  generatedAt = new Date().toISOString(),
): QuestionPreviewManifest {
  const manifest: QuestionPreviewManifest = { generatedAt, questions: [...questions] };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(dirname(generatedManifestPath), { recursive: true });
  mkdirSync(dirname(publicManifestPath), { recursive: true });
  writeFileSync(generatedManifestPath, serialized);
  writeFileSync(publicManifestPath, serialized);
  return manifest;
}
