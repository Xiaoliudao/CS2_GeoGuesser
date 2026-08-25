import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { InboxImportError, isDuplicateImageHash, matchInboxFiles, parseInboxMetadata } from "../../src/content/questionInbox";
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

function failureCode(error: unknown): string {
  if (error instanceof InboxImportError) return error.code;
  if (error instanceof Error && error.message.startsWith("MISSING_OVERVIEW")) return "MISSING_OVERVIEW";
  if (error instanceof Error && error.message.startsWith("R2_UPLOAD_FAILED")) return "R2_UPLOAD_FAILED";
  return "INVALID_IMAGE";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const paths = existsSync(inboxRoot) ? readdirSync(inboxRoot).map((name) => join(inboxRoot, name)) : [];
  const matched = matchInboxFiles(paths);
  const overviewDocument = readJson<{ maps?: Partial<Record<MapId, MapOverview>> }>(overviewPath, {});
  const records = loadImportRecords();
  const previewQuestions: PreviewQuestion[] = [];
  let imported = 0;
  let prepared = 0;
  let skipped = 0;
  let failed = matched.failures.length;

  for (const missing of matched.failures) console.error(`FAILED ${missing.id} ${missing.code}`);

  for (const pair of matched.pairs) {
    try {
      const metadata = parseInboxMetadata(readFileSync(pair.metadataPath, "utf8"));
      const overview = overviewDocument.maps?.[metadata.mapId];
      if (!overview) throw new InboxImportError("MISSING_OVERVIEW", `No synchronized overview for ${metadata.mapId}. Run npm run radar:sync.`);
      const automaticLayer = selectRadarLayer(metadata.worldPosition, overview);
      const automaticPoint = worldToRadarPoint(metadata.worldPosition, overview, automaticLayer);
      const hash = sourceHash(pair.imagePath);
      const imageMetadata = await sharp(pair.imagePath, { failOn: "error" }).metadata();
      if (!imageMetadata.width || !imageMetadata.height || imageMetadata.width < 640 || imageMetadata.height < 360) {
        throw new Error("REAL SCREENSHOT REQUIRED at 640x360 or larger.");
      }
      const sourceFile = basename(pair.imagePath);
      const previewQuestion: PreviewQuestion = {
        previewId: pair.id,
        sourceFile,
        mapId: metadata.mapId,
        layerId: automaticLayer.id as RadarLayerId,
        worldPosition: metadata.worldPosition,
        ...(metadata.viewAngle ? { viewAngle: metadata.viewAngle } : {}),
        automaticPoint,
        screenshotUrl: screenshotPreviewUrl(sourceFile),
        radarUrl: radarPreviewUrl(metadata.mapId, automaticLayer.id as RadarLayerId),
        coordinateSource: "world-conversion",
      };

      console.log(`VALID file=${sourceFile} map=${metadata.mapId} world=${metadata.worldPosition.x},${metadata.worldPosition.y},${metadata.worldPosition.z} layer=${automaticLayer.id} point=${automaticPoint.x.toFixed(6)},${automaticPoint.y.toFixed(6)}`);
      if (dryRun) {
        copyQuestionPreviewAsset(pair.imagePath, publicDevAssetsRoot);
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
      console.error(`FAILED ${pair.id} ${failureCode(error)} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (dryRun) {
    writeQuestionPreviewManifests(previewQuestions, previewManifestPath, publicPreviewManifestPath);
    console.log(`QUESTION_PREVIEW_READY ${publicPreviewManifestPath}`);
  }

  console.log(["QUESTION_INBOX_COMPLETE", `Imported: ${imported}`, `Prepared: ${prepared}`, `Skipped: ${skipped}`, `Failed: ${failed}`, ...(dryRun ? ["DryRun: true"] : [])].join("\n"));
  if (!dryRun && prepared > 0) console.log("PUBLISH_PENDING_R2: QA results and prepared assets were preserved without exposing secret values.");
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
