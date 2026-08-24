import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import sharp from "sharp";
import { InboxImportError, isDuplicateImageHash, matchInboxFiles, parseInboxMetadata } from "../../src/content/questionInbox";
import type { MapId, RadarLayerId } from "../../src/shared/maps";
import { selectRadarLayer, worldToRadarPoint, type MapOverview } from "../../src/shared/radarCoordinates";
import type { ManifestQuestion } from "./question-manifest";
import { writeGeneratedManifest } from "./question-manifest";

interface ImportRecord {
  sourceId: string;
  sourceImageSha256: string;
  sourceImageName: string;
  questionId: string;
  imageAssetId: string;
  importedAt: string;
  mapId: MapId;
}

interface PendingQuestion {
  sourceId: string;
  sourceImageSha256: string;
  sourceImageName: string;
  generatedImage: string;
  preparedAt: string;
  question: ManifestQuestion;
}

const projectRoot = resolve(import.meta.dirname, "..", "..");
const inboxRoot = join(projectRoot, "content", "inbox");
const generatedRoot = join(projectRoot, "content", "generated");
const questionAssetsRoot = join(generatedRoot, "assets", "questions");
const pendingPath = join(generatedRoot, "pending-questions.json");
const overviewPath = join(generatedRoot, "map-overviews.json");
const manifestPath = join(projectRoot, "content", "question-manifest.json");
const recordsPath = join(projectRoot, "content", "imported", "records.json");
const generatedModulePath = join(projectRoot, "src", "worker", "game", "questionManifest.generated.ts");
const bucket = process.env.R2_BUCKET_NAME || "cs2-map-guesser-assets";

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as T : fallback;
}

function sourceHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function upload(path: string, assetId: string): void {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const key = `questions/${assetId}.webp`;
  const result = spawnSync(command, ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", "image/webp", "--remote"], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`R2_UPLOAD_FAILED ${key}`);
}

function failureCode(error: unknown): string {
  if (error instanceof InboxImportError) return error.code;
  if (error instanceof Error && error.message.startsWith("MISSING_OVERVIEW")) return "MISSING_OVERVIEW";
  if (error instanceof Error && error.message.startsWith("R2_UPLOAD_FAILED")) return "R2_UPLOAD_FAILED";
  return "INVALID_IMAGE";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const canUpload = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
  const paths = existsSync(inboxRoot) ? readdirSync(inboxRoot).map((name) => join(inboxRoot, name)) : [];
  const matched = matchInboxFiles(paths);
  const overviewDocument = readJson<{ maps?: Partial<Record<MapId, MapOverview>> }>(overviewPath, {});
  const records = readJson<ImportRecord[]>(recordsPath, []);
  const pending = readJson<PendingQuestion[]>(pendingPath, []);
  const manifest = readJson<ManifestQuestion[]>(manifestPath, []);
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
      if (isDuplicateImageHash(hash, records)) {
        skipped += 1;
        console.log(`SKIPPED ${pair.id} DUPLICATE_IMAGE_HASH`);
        continue;
      }
      const existingPending = pending.find((item) => item.sourceImageSha256 === hash);
      if (existingPending && !canUpload) {
        skipped += 1;
        console.log(`SKIPPED ${pair.id} ALREADY_PENDING`);
        continue;
      }
      const imageMetadata = await sharp(pair.imagePath, { failOn: "error" }).metadata();
      if (!imageMetadata.width || !imageMetadata.height || imageMetadata.width < 640 || imageMetadata.height < 360) {
        throw new Error("REAL SCREENSHOT REQUIRED at 640x360 or larger.");
      }
      const assetId = existingPending?.question.imageAssetId ?? randomUUID().replaceAll("-", "");
      const questionId = existingPending?.question.id ?? `q-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const output = join(questionAssetsRoot, `${assetId}.webp`);
      const question: ManifestQuestion = existingPending?.question ?? {
        id: questionId,
        imageAssetId: assetId,
        correctMapId: metadata.mapId,
        correctLayerId: automaticLayer.id as RadarLayerId,
        correctPoint: automaticPoint,
        worldPosition: metadata.worldPosition,
        ...(metadata.viewAngle ? { viewAngle: metadata.viewAngle } : {}),
        coordinateSource: "world-conversion",
      };

      console.log(`VALID file=${basename(pair.imagePath)} map=${metadata.mapId} world=${metadata.worldPosition.x},${metadata.worldPosition.y},${metadata.worldPosition.z} layer=${automaticLayer.id} point=${automaticPoint.x.toFixed(6)},${automaticPoint.y.toFixed(6)}`);
      if (dryRun) continue;
      mkdirSync(dirname(output), { recursive: true });
      if (!existsSync(output)) await sharp(pair.imagePath).rotate().webp({ quality: 88, effort: 6 }).toFile(output);

      if (!canUpload) {
        pending.push({
          sourceId: pair.id,
          sourceImageSha256: hash,
          sourceImageName: basename(pair.imagePath),
          generatedImage: relative(projectRoot, output).replaceAll("\\", "/"),
          preparedAt: new Date().toISOString(),
          question,
        });
        mkdirSync(dirname(pendingPath), { recursive: true });
        writeFileSync(pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
        prepared += 1;
        console.log(`PREPARED ${pair.id} R2_UPLOAD_PENDING`);
        continue;
      }

      upload(output, assetId);
      if (!manifest.some((candidate) => candidate.id === question.id)) manifest.push(question);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeGeneratedManifest(generatedModulePath, manifest);
      records.push({
        sourceId: pair.id,
        sourceImageSha256: hash,
        sourceImageName: basename(pair.imagePath),
        questionId: question.id,
        imageAssetId: question.imageAssetId,
        importedAt: new Date().toISOString(),
        mapId: question.correctMapId,
      });
      mkdirSync(dirname(recordsPath), { recursive: true });
      writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
      const pendingIndex = pending.findIndex((item) => item.sourceImageSha256 === hash);
      if (pendingIndex >= 0) {
        pending.splice(pendingIndex, 1);
        writeFileSync(pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
      }
      imported += 1;
      console.log(`IMPORTED ${pair.id} question=${question.id}`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${pair.id} ${failureCode(error)} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(["QUESTION_INBOX_COMPLETE", `Imported: ${imported}`, `Prepared: ${prepared}`, `Skipped: ${skipped}`, `Failed: ${failed}`, ...(dryRun ? ["DryRun: true"] : [])].join("\n"));
  if (!dryRun && !canUpload && prepared > 0) console.log("R2_UPLOAD_PENDING: no Cloudflare secret values were read or requested.");
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
