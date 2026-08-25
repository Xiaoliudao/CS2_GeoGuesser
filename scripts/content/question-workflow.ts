import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import sharp from "sharp";
import {
  getFinalQuestionPoint,
  getPreviewQuestionStatus,
  updateQuestionOverrides,
  type PreviewQuestion,
  type QaPreviewQuestion,
  type QuestionOverrideMap,
  type QuestionPreviewManifest,
} from "../../src/content/questionPreview.ts";
import type { MapId } from "../../src/shared/maps.ts";
import type { MapPoint } from "../../src/shared/types.ts";
import type { ManifestQuestion } from "./question-manifest.ts";
import {
  getRemoteQuestion,
  getRemoteQuestionByContentHash,
  insertRemoteQuestion,
  runWrangler,
  verifyRemoteR2Object,
} from "./question-d1-admin.ts";

export interface ImportRecord {
  sourceId: string;
  sourceImageSha256: string;
  sourceImageName: string;
  questionId: string;
  imageAssetId: string;
  importedAt: string;
  mapId: MapId;
}

export interface PendingQuestion {
  sourceId: string;
  sourceImageSha256: string;
  sourceImageName: string;
  generatedImage: string;
  approvedAt: string;
  question: ManifestQuestion;
}

export interface PublishResult {
  status: "publish-pending" | "published";
  questionId: string;
  message?: string;
}

export const projectRoot = resolve(import.meta.dirname, "..", "..");
export const generatedRoot = join(projectRoot, "content", "generated");
export const previewManifestPath = join(generatedRoot, "question-preview.json");
export const overridesPath = join(generatedRoot, "question-overrides.json");
export const pendingPath = join(generatedRoot, "pending-questions.json");
export const preparedQuestionsRoot = join(generatedRoot, "prepared-questions");
export const inboxRoot = join(projectRoot, "content", "inbox");
export const recordsPath = join(projectRoot, "content", "imported", "records.json");
const bucket = process.env.R2_BUCKET_NAME || "cs2-map-guesser-assets";

export function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as T : fallback;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadPreviewManifest(): QuestionPreviewManifest {
  return readJson<QuestionPreviewManifest>(previewManifestPath, { generatedAt: "", questions: [] });
}

export function loadQuestionOverrides(): QuestionOverrideMap {
  return readJson<QuestionOverrideMap>(overridesPath, {});
}

export function loadPendingQuestions(): PendingQuestion[] {
  return readJson<PendingQuestion[]>(pendingPath, []);
}

export function loadImportRecords(): ImportRecord[] {
  return readJson<ImportRecord[]>(recordsPath, []);
}

function qaQuestionFor(preview: PreviewQuestion): QaPreviewQuestion {
  const override = loadQuestionOverrides()[preview.previewId];
  const pending = loadPendingQuestions().some((item) => item.sourceId === preview.previewId);
  const published = loadImportRecords().some((item) => item.sourceId === preview.previewId);
  return {
    ...preview,
    ...(override ? { manualOverride: override } : {}),
    finalPoint: getFinalQuestionPoint({ automaticPoint: preview.automaticPoint, manualOverride: override }),
    status: getPreviewQuestionStatus({ hasOverride: Boolean(override), isPending: pending, isPublished: published }),
  };
}

export function listQaPreviewQuestions(): QaPreviewQuestion[] {
  return loadPreviewManifest().questions.map(qaQuestionFor);
}

function requirePreview(previewId: string): PreviewQuestion {
  const preview = loadPreviewManifest().questions.find((question) => question.previewId === previewId);
  if (!preview) throw new Error(`UNKNOWN_PREVIEW ${previewId}`);
  return preview;
}

function updatePendingPoint(preview: PreviewQuestion, manualOverride?: MapPoint): void {
  const pending = loadPendingQuestions();
  const index = pending.findIndex((item) => item.sourceId === preview.previewId);
  if (index < 0) return;
  const item = pending[index];
  item.question = {
    ...item.question,
    automaticPoint: preview.automaticPoint,
    correctPoint: getFinalQuestionPoint({ automaticPoint: preview.automaticPoint, manualOverride }),
    coordinateSource: manualOverride ? "manual-override" : "world-conversion",
  };
  writeJson(pendingPath, pending);
}

export function saveQuestionOverride(previewId: string, point: MapPoint | null): QaPreviewQuestion {
  const preview = requirePreview(previewId);
  if (loadImportRecords().some((item) => item.sourceId === previewId)) throw new Error("PUBLISHED_QUESTION_IS_IMMUTABLE");
  let overrides = loadQuestionOverrides();
  if (point === null) {
    overrides = updateQuestionOverrides(overrides, previewId, null);
    updatePendingPoint(preview);
  } else {
    overrides = updateQuestionOverrides(overrides, previewId, point);
    updatePendingPoint(preview, point);
  }
  writeJson(overridesPath, overrides);
  return qaQuestionFor(preview);
}

export function hasCloudflareAuth(): boolean {
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) return true;
  const result = runWrangler(["whoami"], "ignore");
  return !result.error && result.status === 0;
}

function uploadPreparedQuestion(path: string, assetId: string): void {
  const key = `questions/${assetId}.webp`;
  const result = runWrangler(["r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", "image/webp", "--remote"], "inherit");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`R2_UPLOAD_FAILED ${key}`);
}

function recordPublishedQuestion(entry: PendingQuestion): void {
  const records = loadImportRecords();
  if (!records.some((record) => record.sourceImageSha256 === entry.sourceImageSha256)) {
    records.push({
      sourceId: entry.sourceId,
      sourceImageSha256: entry.sourceImageSha256,
      sourceImageName: entry.sourceImageName,
      questionId: entry.question.id,
      imageAssetId: entry.question.imageAssetId,
      importedAt: new Date().toISOString(),
      mapId: entry.question.correctMapId,
    });
    writeJson(recordsPath, records);
  }
  writeJson(pendingPath, loadPendingQuestions().filter((item) => item.sourceId !== entry.sourceId));
}

export async function preparePreviewQuestion(preview: PreviewQuestion, sourcePath = join(inboxRoot, preview.sourceFile)): Promise<PendingQuestion> {
  if (basename(preview.sourceFile) !== preview.sourceFile || !existsSync(sourcePath)) throw new Error("PREVIEW_SCREENSHOT_NOT_FOUND");
  const metadata = await sharp(sourcePath, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 360) throw new Error("INVALID_PREVIEW_SCREENSHOT");
  const hash = sourceHash(sourcePath);
  const duplicateRecord = loadImportRecords().find((record) => record.sourceImageSha256 === hash && record.sourceId !== preview.previewId);
  if (duplicateRecord) throw new Error(`DUPLICATE_IMAGE_HASH ${duplicateRecord.sourceId}`);
  const pending = loadPendingQuestions();
  const existing = pending.find((item) => item.sourceId === preview.previewId || item.sourceImageSha256 === hash);
  const imageAssetId = existing?.question.imageAssetId ?? randomUUID().replaceAll("-", "");
  const questionId = existing?.question.id ?? `q-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const output = join(preparedQuestionsRoot, `${imageAssetId}.webp`);
  mkdirSync(dirname(output), { recursive: true });
  if (!existsSync(output)) await sharp(sourcePath).rotate().webp({ quality: 88, effort: 6 }).toFile(output);
  const manualOverride = loadQuestionOverrides()[preview.previewId];
  const entry: PendingQuestion = {
    sourceId: preview.previewId,
    sourceImageSha256: hash,
    sourceImageName: preview.sourceFile,
    generatedImage: relative(projectRoot, output).replaceAll("\\", "/"),
    approvedAt: existing?.approvedAt ?? new Date().toISOString(),
    question: {
      id: questionId,
      imageAssetId,
      correctMapId: preview.mapId,
      correctLayerId: preview.layerId,
      correctPoint: getFinalQuestionPoint({ automaticPoint: preview.automaticPoint, manualOverride }),
      automaticPoint: preview.automaticPoint,
      worldPosition: preview.worldPosition,
      ...(preview.viewAngle ? { viewAngle: preview.viewAngle } : {}),
      coordinateSource: manualOverride ? "manual-override" : "world-conversion",
    },
  };
  const index = pending.findIndex((item) => item.sourceId === preview.previewId || item.sourceImageSha256 === hash);
  if (index >= 0) pending[index] = entry;
  else pending.push(entry);
  writeJson(pendingPath, pending);
  return entry;
}

export function publishPreparedQuestion(entry: PendingQuestion): PublishResult {
  if (!hasCloudflareAuth()) {
    return { status: "publish-pending", questionId: entry.question.id, message: "PUBLISH_PENDING_R2. Run npx wrangler login, then npm run questions:publish-pending." };
  }
  const output = resolve(projectRoot, entry.generatedImage);
  const relativeOutput = relative(resolve(preparedQuestionsRoot), output);
  if (relativeOutput.startsWith("..") || isAbsolute(relativeOutput) || !existsSync(output)) throw new Error("INVALID_PREPARED_QUESTION_PATH");
  const imageAssetKey = `questions/${entry.question.imageAssetId}.webp`;
  try {
    const existingById = getRemoteQuestion(entry.question.id);
    const existingByHash = getRemoteQuestionByContentHash(entry.sourceImageSha256);
    if (existingByHash && existingByHash.id !== entry.question.id) {
      throw new Error(`DUPLICATE_CONTENT_HASH ${existingByHash.id}`);
    }
    if (existingById && existingById.content_hash !== entry.sourceImageSha256) {
      throw new Error(`QUESTION_ID_CONFLICT ${entry.question.id}`);
    }
    if (!existingById) {
      uploadPreparedQuestion(output, entry.question.imageAssetId);
      verifyRemoteR2Object(bucket, imageAssetKey);
      const result = insertRemoteQuestion({
        question: entry.question,
        imageAssetKey,
        contentHash: entry.sourceImageSha256,
        sourcePreviewId: entry.sourceId,
      });
      if (result.row.id !== entry.question.id || result.row.image_asset_key !== imageAssetKey) {
        throw new Error(`D1_PUBLISH_CONFIRMATION_FAILED ${entry.question.id}`);
      }
    } else {
      if (existingById.image_asset_key !== imageAssetKey) throw new Error(`QUESTION_ASSET_KEY_CONFLICT ${entry.question.id}`);
      verifyRemoteR2Object(bucket, imageAssetKey);
    }
  } catch (error) {
    return {
      status: "publish-pending",
      questionId: entry.question.id,
      message: `PUBLISH_PENDING_D1_OR_R2 ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  recordPublishedQuestion(entry);
  return { status: "published", questionId: entry.question.id };
}

export async function publishPreviewQuestion(previewId: string): Promise<PublishResult> {
  const alreadyPublished = loadImportRecords().find((record) => record.sourceId === previewId);
  if (alreadyPublished) {
    try {
      const remote = getRemoteQuestion(alreadyPublished.questionId);
      if (remote) return { status: "published", questionId: alreadyPublished.questionId };
      return {
        status: "publish-pending",
        questionId: alreadyPublished.questionId,
        message: "QUESTION_NOT_IN_D1. Run npm run questions:migrate-to-d1.",
      };
    } catch (error) {
      return {
        status: "publish-pending",
        questionId: alreadyPublished.questionId,
        message: `PUBLISH_PENDING_D1 ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const entry = await preparePreviewQuestion(requirePreview(previewId));
  return publishPreparedQuestion(entry);
}
