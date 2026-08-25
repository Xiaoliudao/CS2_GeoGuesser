import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { MapId, RadarLayerId } from "../shared/maps";
import type { PreviewQuestion, QuestionPreviewManifest } from "./questionPreview";

export function copyQuestionPreviewAsset(sourcePath: string, publicDevAssetsRoot: string): string {
  const fileName = basename(sourcePath);
  const target = join(publicDevAssetsRoot, "questions", fileName);
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
