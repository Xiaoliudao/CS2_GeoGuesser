import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import {
  InboxImportError,
  hasUsableQuestionImageDimensions,
  isDuplicateImageHash,
  matchInboxFiles,
  parseInboxMetadata,
  validateInboxFolderMap,
} from "../../src/content/questionInbox";
import { radarPreviewUrl, screenshotPreviewUrl, type PreviewQuestion } from "../../src/content/questionPreview";
import { copyQuestionPreviewAsset, writeQuestionPreviewManifests } from "../../src/content/questionPreviewWriter";
import type { MapId, RadarLayerId } from "../../src/shared/maps";
import { selectRadarLayer, worldToRadarPoint, type MapOverview } from "../../src/shared/radarCoordinates";
import { loadImportRecords, preparePreviewQuestion, publishPreparedQuestion, readJson } from "./question-workflow";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const inboxRoot = join(projectRoot, "content", "inbox");
const generatedRoot = join(projectRoot, "content", "generated");
const previewManifestPath = join(generatedRoot, "question-preview.json");
const publicDevAssetsRoot = join(projectRoot, "public", "__dev_assets__");
const publicPreviewManifestPath = join(publicDevAssetsRoot, "question-preview.json");
const overviewPath = join(generatedRoot, "map-overviews.json");

function sourceHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listInboxFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) return listInboxFiles(entryPath);
      return entry.isFile() ? [entryPath] : [];
    });
}

function failureCode(error: unknown): string {
  if (error instanceof InboxImportError) return error.code;
  if (error instanceof Error && error.message.startsWith("MISSING_OVERVIEW")) return "MISSING_OVERVIEW";
  if (error instanceof Error && error.message.startsWith("R2_UPLOAD_FAILED")) return "R2_UPLOAD_FAILED";
  return "INVALID_IMAGE";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const paths = listInboxFiles(inboxRoot);
  const matched = matchInboxFiles(paths, inboxRoot);
  const overviewDocument = readJson<{ maps?: Partial<Record<MapId, MapOverview>> }>(overviewPath, {});
  const records = loadImportRecords();
  const previewQuestions: PreviewQuestion[] = [];
  const found = matched.pairs.length + matched.failures.length;
  let valid = 0;
  let imported = 0;
  let prepared = 0;
  let skipped = 0;
  let failed = matched.failures.length;

  for (const missing of matched.failures) console.error(`FAILED ${missing.relativeSourcePath} ${missing.code}`);

  for (const pair of matched.pairs) {
    try {
      const metadata = parseInboxMetadata(readFileSync(pair.metadataPath, "utf8"));
      validateInboxFolderMap(pair, metadata.mapId);
      const overview = overviewDocument.maps?.[metadata.mapId];
      if (!overview) throw new InboxImportError("MISSING_OVERVIEW", `No synchronized overview for ${metadata.mapId}. Run npm run radar:sync.`);
      const automaticLayer = selectRadarLayer(metadata.worldPosition, overview);
      const automaticPoint = worldToRadarPoint(metadata.worldPosition, overview, automaticLayer);
      const hash = sourceHash(pair.imagePath);
      const imageMetadata = await sharp(pair.imagePath, { failOn: "error" }).metadata();
      if (!hasUsableQuestionImageDimensions(imageMetadata.width, imageMetadata.height)) {
        throw new Error("REAL SCREENSHOT REQUIRED at 320x240 or larger.");
      }
      const sourceFile = basename(pair.imagePath);
      const previewQuestion: PreviewQuestion = {
        previewId: pair.id,
        ...(pair.legacyId !== pair.id ? { legacyPreviewId: pair.legacyId } : {}),
        sourceFile,
        relativeSourcePath: pair.relativeSourcePath,
        sourceImageSha256: hash,
        mapId: metadata.mapId,
        layerId: automaticLayer.id as RadarLayerId,
        worldPosition: metadata.worldPosition,
        ...(metadata.viewAngle ? { viewAngle: metadata.viewAngle } : {}),
        automaticPoint,
        screenshotUrl: screenshotPreviewUrl(pair.relativeSourcePath),
        radarUrl: radarPreviewUrl(metadata.mapId, automaticLayer.id as RadarLayerId),
        coordinateSource: "world-conversion",
      };

      valid += 1;
      console.log(`VALID ${pair.relativeSourcePath} map=${metadata.mapId} world=${metadata.worldPosition.x},${metadata.worldPosition.y},${metadata.worldPosition.z} layer=${automaticLayer.id} point=${automaticPoint.x.toFixed(6)},${automaticPoint.y.toFixed(6)}`);
      if (dryRun) {
        copyQuestionPreviewAsset(pair.imagePath, publicDevAssetsRoot, pair.relativeSourcePath);
        previewQuestions.push(previewQuestion);
        continue;
      }
      if (isDuplicateImageHash(hash, records)) {
        skipped += 1;
        console.log(`SKIPPED ${pair.id} DUPLICATE_IMAGE_HASH`);
        continue;
      }
      const entry = await preparePreviewQuestion(previewQuestion, pair.imagePath);
      const result = publishPreparedQuestion(entry);
      if (result.status === "published") {
        imported += 1;
        console.log(`IMPORTED ${pair.id} question=${result.questionId}`);
      } else {
        prepared += 1;
        console.log(`PREPARED ${pair.id} ${result.message ?? "PUBLISH_PENDING_R2"}`);
      }
    } catch (error) {
      failed += 1;
      const code = failureCode(error);
      if (code === "FOLDER_MAP_MISMATCH") {
        console.warn(`WARNING ${pair.relativeSourcePath} FOLDER_MAP_MISMATCH ${error instanceof Error ? error.message : String(error)}`);
      }
      console.error(`FAILED ${pair.relativeSourcePath} ${code} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (dryRun) {
    writeQuestionPreviewManifests(previewQuestions, previewManifestPath, publicPreviewManifestPath);
    console.log(`QUESTION_PREVIEW_READY ${publicPreviewManifestPath}`);
  }

  console.log([
    "QUESTION_INBOX_COMPLETE",
    `Found: ${found}`,
    `Valid: ${valid}`,
    `Imported: ${imported}`,
    `Prepared: ${prepared}`,
    `Skipped: ${skipped}`,
    `Failed: ${failed}`,
    ...(dryRun ? ["DryRun: true"] : []),
  ].join("\n"));
  if (!dryRun && prepared > 0) console.log("PUBLISH_PENDING_R2: QA results and prepared assets were preserved without exposing secret values.");
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
