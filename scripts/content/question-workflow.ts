import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import sharp from "sharp";
import {
  GAME_IMAGE_RESIZE_OPTIONS,
  QUESTION_GAME_MAX_EDGE,
  QUESTION_GAME_WEBP_QUALITY,
} from "../../src/content/imageOptimization.ts";
import {
  getEffectiveQuestionDifficulty,
  getFinalQuestionPoint,
  getPreviewQuestionStatus,
  updateQuestionDifficultyOverrides,
  updateQuestionOverrides,
  type PreviewQuestion,
  type QaPreviewQuestion,
  type QuestionDifficultyOverrideMap,
  type QuestionOverrideMap,
  type QuestionPreviewManifest,
} from "../../src/content/questionPreview.ts";
import type { MapId } from "../../src/shared/maps.ts";
import type { MapPoint } from "../../src/shared/types.ts";
import { QuestionDifficultySchema, type QuestionDifficulty } from "../../src/shared/questionDifficulty.ts";
import { hasUsableQuestionImageDimensions } from "../../src/content/questionInbox.ts";
import type { ManifestQuestion } from "./question-manifest.ts";
import {
  getRemoteQuestion,
  getRemoteQuestionByContentHash,
  getRemoteQuestionByPreviewId,
  insertRemoteQuestion,
  type RemoteQuestionRow,
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
  disposition?: "created" | "already-published";
  message?: string;
}

export const projectRoot = resolve(import.meta.dirname, "..", "..");
export const generatedRoot = join(projectRoot, "content", "generated");
export const previewManifestPath = join(generatedRoot, "question-preview.json");
export const overridesPath = join(generatedRoot, "question-overrides.json");
export const difficultyOverridesPath = join(generatedRoot, "question-difficulty-overrides.json");
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

export function previewIdentityAliases(
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
): string[] {
  const aliases = [preview.previewId];
  const legacyPreviewId = preview.legacyPreviewId;
  if (
    legacyPreviewId
    && legacyPreviewId !== preview.previewId
    && previews.filter((candidate) => candidate.legacyPreviewId === legacyPreviewId || candidate.previewId === legacyPreviewId).length === 1
  ) {
    aliases.push(legacyPreviewId);
  }
  return aliases;
}

function recordMatchesPreview(
  record: Pick<ImportRecord, "sourceId" | "sourceImageSha256">,
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
): boolean {
  return record.sourceImageSha256 === preview.sourceImageSha256
    || previewIdentityAliases(preview, previews).includes(record.sourceId);
}

function pendingMatchesPreview(
  pending: Pick<PendingQuestion, "sourceId" | "sourceImageSha256">,
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
): boolean {
  return pending.sourceImageSha256 === preview.sourceImageSha256
    || previewIdentityAliases(preview, previews).includes(pending.sourceId);
}

function overrideEntryFor(
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
  overrides: QuestionOverrideMap,
): { key: string; point: MapPoint } | null {
  for (const key of previewIdentityAliases(preview, previews)) {
    const point = overrides[key];
    if (point) return { key, point };
  }
  return null;
}

function difficultyEntryFor(
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
  overrides: QuestionDifficultyOverrideMap,
): { key: string; difficulty: QuestionDifficulty } | null {
  for (const key of previewIdentityAliases(preview, previews)) {
    const difficulty = overrides[key];
    if (difficulty) return { key, difficulty };
  }
  return null;
}

export function loadQuestionOverrides(): QuestionOverrideMap {
  return readJson<QuestionOverrideMap>(overridesPath, {});
}

export function loadQuestionDifficultyOverrides(): QuestionDifficultyOverrideMap {
  const raw = readJson<Record<string, unknown>>(difficultyOverridesPath, {});
  return Object.fromEntries(Object.entries(raw).map(([previewId, difficulty]) => {
    const parsed = QuestionDifficultySchema.safeParse(difficulty);
    if (!parsed.success) throw new Error(`INVALID_DIFFICULTY_OVERRIDE ${previewId}`);
    return [previewId, parsed.data];
  }));
}

export function loadPendingQuestions(): PendingQuestion[] {
  return readJson<PendingQuestion[]>(pendingPath, []);
}

export function loadImportRecords(): ImportRecord[] {
  return readJson<ImportRecord[]>(recordsPath, []);
}

function qaQuestionFor(
  preview: PreviewQuestion,
  previews: readonly PreviewQuestion[],
  overrides: QuestionOverrideMap,
  difficultyOverrides: QuestionDifficultyOverrideMap,
  pendingQuestions: readonly PendingQuestion[],
  records: readonly ImportRecord[],
): QaPreviewQuestion {
  const override = overrideEntryFor(preview, previews, overrides)?.point;
  const difficultyOverride = difficultyEntryFor(preview, previews, difficultyOverrides)?.difficulty;
  const difficulty = getEffectiveQuestionDifficulty(preview, difficultyOverride);
  const pending = pendingQuestions.some((item) => pendingMatchesPreview(item, preview, previews));
  const published = records.some((item) => recordMatchesPreview(item, preview, previews));
  return {
    ...preview,
    ...(difficulty ? { difficulty } : {}),
    ...(override ? { manualOverride: override } : {}),
    finalPoint: getFinalQuestionPoint({ automaticPoint: preview.automaticPoint, manualOverride: override }),
    status: getPreviewQuestionStatus({ hasOverride: Boolean(override), isPending: pending, isPublished: published }),
  };
}

export function listQaPreviewQuestions(): QaPreviewQuestion[] {
  const previews = loadPreviewManifest().questions;
  const overrides = loadQuestionOverrides();
  const difficultyOverrides = loadQuestionDifficultyOverrides();
  const pending = loadPendingQuestions();
  const records = loadImportRecords();
  return previews.map((preview) => qaQuestionFor(preview, previews, overrides, difficultyOverrides, pending, records));
}

function requirePreview(previewId: string): PreviewQuestion {
  const previews = loadPreviewManifest().questions;
  const exact = previews.find((question) => question.previewId === previewId);
  const legacyMatches = previews.filter((question) => question.legacyPreviewId === previewId);
  const preview = exact ?? (legacyMatches.length === 1 ? legacyMatches[0] : undefined);
  if (!exact && legacyMatches.length > 1) throw new Error(`AMBIGUOUS_PREVIEW ${previewId}`);
  if (!preview) throw new Error(`UNKNOWN_PREVIEW ${previewId}`);
  return preview;
}

function updatePendingPoint(preview: PreviewQuestion, manualOverride?: MapPoint): void {
  const previews = loadPreviewManifest().questions;
  const pending = loadPendingQuestions();
  const index = pending.findIndex((item) => pendingMatchesPreview(item, preview, previews));
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

function updatePendingDifficulty(preview: PreviewQuestion, difficulty?: QuestionDifficulty): void {
  const previews = loadPreviewManifest().questions;
  const pending = loadPendingQuestions();
  const index = pending.findIndex((item) => pendingMatchesPreview(item, preview, previews));
  if (index < 0) return;
  const item = pending[index];
  if (difficulty) item.question = { ...item.question, difficulty };
  else {
    const { difficulty: _removed, ...question } = item.question;
    item.question = question as ManifestQuestion;
  }
  writeJson(pendingPath, pending);
}

export function saveQuestionOverride(previewId: string, point: MapPoint | null): QaPreviewQuestion {
  const preview = requirePreview(previewId);
  const previews = loadPreviewManifest().questions;
  if (loadImportRecords().some((item) => recordMatchesPreview(item, preview, previews))) {
    throw new Error("PUBLISHED_QUESTION_IS_IMMUTABLE");
  }
  let overrides = loadQuestionOverrides();
  const overrideKey = overrideEntryFor(preview, previews, overrides)?.key ?? preview.previewId;
  if (point === null) {
    overrides = updateQuestionOverrides(overrides, overrideKey, null);
    updatePendingPoint(preview);
  } else {
    overrides = updateQuestionOverrides(overrides, overrideKey, point);
    updatePendingPoint(preview, point);
  }
  writeJson(overridesPath, overrides);
  return qaQuestionFor(
    preview,
    previews,
    overrides,
    loadQuestionDifficultyOverrides(),
    loadPendingQuestions(),
    loadImportRecords(),
  );
}

export function saveQuestionDifficulty(
  previewId: string,
  rawDifficulty: QuestionDifficulty | null,
): QaPreviewQuestion {
  const preview = requirePreview(previewId);
  const previews = loadPreviewManifest().questions;
  if (loadImportRecords().some((item) => recordMatchesPreview(item, preview, previews))) {
    throw new Error("PUBLISHED_QUESTION_IS_IMMUTABLE");
  }
  const difficulty = rawDifficulty === null ? null : QuestionDifficultySchema.parse(rawDifficulty);
  let overrides = loadQuestionDifficultyOverrides();
  const overrideKey = difficultyEntryFor(preview, previews, overrides)?.key ?? preview.previewId;
  overrides = updateQuestionDifficultyOverrides(overrides, overrideKey, difficulty);
  writeJson(difficultyOverridesPath, overrides);
  const effectiveDifficulty = getEffectiveQuestionDifficulty(preview, difficulty);
  updatePendingDifficulty(preview, effectiveDifficulty);
  return qaQuestionFor(
    preview,
    previews,
    loadQuestionOverrides(),
    overrides,
    loadPendingQuestions(),
    loadImportRecords(),
  );
}

export function requireQuestionDifficultyForPublish(value: unknown): QuestionDifficulty {
  if (value === undefined || value === null || value === "") throw new Error("SELECT_A_DIFFICULTY");
  const parsed = QuestionDifficultySchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_DIFFICULTY");
  return parsed.data;
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

function imageAssetIdFromKey(imageAssetKey: string): string {
  return basename(imageAssetKey, extname(imageAssetKey));
}

function recordPublishedQuestion(entry: PendingQuestion, remote?: RemoteQuestionRow): void {
  const records = loadImportRecords();
  if (!records.some((record) => record.sourceImageSha256 === entry.sourceImageSha256)) {
    records.push({
      sourceId: entry.sourceId,
      sourceImageSha256: entry.sourceImageSha256,
      sourceImageName: entry.sourceImageName,
      questionId: remote?.id ?? entry.question.id,
      imageAssetId: remote ? imageAssetIdFromKey(remote.image_asset_key) : entry.question.imageAssetId,
      importedAt: new Date().toISOString(),
      mapId: (remote?.map_id as MapId | undefined) ?? entry.question.correctMapId,
    });
    writeJson(recordsPath, records);
  }
  writeJson(
    pendingPath,
    loadPendingQuestions().filter((item) => (
      item.sourceId !== entry.sourceId && item.sourceImageSha256 !== entry.sourceImageSha256
    )),
  );
}

export async function preparePreviewQuestion(preview: PreviewQuestion, sourcePath?: string): Promise<PendingQuestion> {
  const resolvedSourcePath = resolve(sourcePath ?? join(inboxRoot, ...preview.relativeSourcePath.replaceAll("\\", "/").split("/")));
  const relativeSource = relative(resolve(inboxRoot), resolvedSourcePath);
  if (relativeSource.startsWith("..") || isAbsolute(relativeSource) || !existsSync(resolvedSourcePath)) {
    throw new Error("PREVIEW_SCREENSHOT_NOT_FOUND");
  }
  const metadata = await sharp(resolvedSourcePath, { failOn: "error" }).metadata();
  if (!hasUsableQuestionImageDimensions(metadata.width, metadata.height)) throw new Error("INVALID_PREVIEW_SCREENSHOT");
  const hash = sourceHash(resolvedSourcePath);
  if (hash !== preview.sourceImageSha256) throw new Error("PREVIEW_SOURCE_CHANGED_RERUN_DRY_RUN");
  const previews = loadPreviewManifest().questions;
  const difficulty = requireQuestionDifficultyForPublish(getEffectiveQuestionDifficulty(
    preview,
    difficultyEntryFor(preview, previews, loadQuestionDifficultyOverrides())?.difficulty,
  ));
  const pending = loadPendingQuestions();
  const existing = pending.find((item) => pendingMatchesPreview(item, preview, previews));
  const imageAssetId = existing?.question.imageAssetId ?? randomUUID().replaceAll("-", "");
  const questionId = existing?.question.id ?? `q-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const output = join(preparedQuestionsRoot, `${imageAssetId}.webp`);
  mkdirSync(dirname(output), { recursive: true });
  // The inbox file remains the archival original. This generated object is the
  // bounded gameplay variant and is safe to regenerate before publication.
  await sharp(resolvedSourcePath)
    .rotate()
    .resize({ width: QUESTION_GAME_MAX_EDGE, height: QUESTION_GAME_MAX_EDGE, ...GAME_IMAGE_RESIZE_OPTIONS })
    .webp({ quality: QUESTION_GAME_WEBP_QUALITY, effort: 6 })
    .toFile(output);
  const manualOverride = overrideEntryFor(preview, previews, loadQuestionOverrides())?.point;
  const entry: PendingQuestion = {
    sourceId: preview.previewId,
    sourceImageSha256: hash,
    sourceImageName: preview.relativeSourcePath,
    generatedImage: relative(projectRoot, output).replaceAll("\\", "/"),
    approvedAt: existing?.approvedAt ?? new Date().toISOString(),
    question: {
      id: questionId,
      imageAssetId,
      correctMapId: preview.mapId,
      correctLayerId: preview.layerId,
      difficulty,
      correctPoint: getFinalQuestionPoint({ automaticPoint: preview.automaticPoint, manualOverride }),
      automaticPoint: preview.automaticPoint,
      worldPosition: preview.worldPosition,
      ...(preview.viewAngle ? { viewAngle: preview.viewAngle } : {}),
      coordinateSource: manualOverride ? "manual-override" : "world-conversion",
    },
  };
  const index = pending.findIndex((item) => pendingMatchesPreview(item, preview, previews));
  if (index >= 0) pending[index] = entry;
  else pending.push(entry);
  writeJson(pendingPath, pending);
  return entry;
}

export function publishPreparedQuestion(entry: PendingQuestion): PublishResult {
  requireQuestionDifficultyForPublish(entry.question.difficulty);
  if (!hasCloudflareAuth()) {
    return { status: "publish-pending", questionId: entry.question.id, message: "PUBLISH_PENDING_R2. Run npx wrangler login, then npm run questions:publish-pending." };
  }
  const output = resolve(projectRoot, entry.generatedImage);
  const relativeOutput = relative(resolve(preparedQuestionsRoot), output);
  if (relativeOutput.startsWith("..") || isAbsolute(relativeOutput) || !existsSync(output)) throw new Error("INVALID_PREPARED_QUESTION_PATH");
  const imageAssetKey = `questions/${entry.question.imageAssetId}.webp`;
  let disposition: PublishResult["disposition"] = "already-published";
  try {
    const existingById = getRemoteQuestion(entry.question.id);
    const existingByHash = getRemoteQuestionByContentHash(entry.sourceImageSha256);
    const existingByPreview = getRemoteQuestionByPreviewId(entry.sourceId);
    if (existingById && existingById.content_hash !== entry.sourceImageSha256) {
      throw new Error(`QUESTION_ID_CONFLICT ${entry.question.id}`);
    }
    if (existingByPreview && existingByPreview.content_hash !== entry.sourceImageSha256) {
      throw new Error(`SOURCE_PREVIEW_ID_CONFLICT ${entry.sourceId}`);
    }
    if (existingByHash && existingByPreview && existingByHash.id !== existingByPreview.id) {
      throw new Error(`D1_DUPLICATE_IDENTITY_CONFLICT ${entry.sourceId}`);
    }
    const existing = existingByHash ?? existingByPreview ?? existingById;
    if (!existing) {
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
      disposition = result.inserted ? "created" : "already-published";
      recordPublishedQuestion(entry, result.row);
    } else {
      verifyRemoteR2Object(bucket, existing.image_asset_key);
      recordPublishedQuestion(entry, existing);
    }
  } catch (error) {
    return {
      status: "publish-pending",
      questionId: entry.question.id,
      message: `PUBLISH_PENDING_D1_OR_R2 ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const record = loadImportRecords().find((item) => item.sourceImageSha256 === entry.sourceImageSha256);
  return { status: "published", questionId: record?.questionId ?? entry.question.id, disposition };
}

export async function publishPreviewQuestion(previewId: string): Promise<PublishResult> {
  const preview = requirePreview(previewId);
  const previews = loadPreviewManifest().questions;
  const alreadyPublished = loadImportRecords().find((record) => recordMatchesPreview(record, preview, previews));
  if (alreadyPublished) {
    try {
      const remote = getRemoteQuestion(alreadyPublished.questionId);
      if (remote) {
        return {
          status: "published",
          questionId: alreadyPublished.questionId,
          disposition: "already-published",
        };
      }
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
  const entry = await preparePreviewQuestion(preview);
  return publishPreparedQuestion(entry);
}
