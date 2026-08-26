import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestQuestion } from "./question-manifest.ts";
import { QuestionDifficultySchema, type QuestionDifficulty } from "../../src/shared/questionDifficulty.ts";
import {
  getRemoteCatalogMeta,
  insertRemoteQuestion,
  listRemoteQuestions,
  projectRoot,
  setRemoteQuestionEnabled,
  setRemoteQuestionDifficulty,
  updateRemoteQuestionPoint,
  verifyRemoteR2Object,
} from "./question-d1-admin.ts";
import { readJson, type ImportRecord } from "./question-workflow.ts";

const bucket = process.env.R2_BUCKET_NAME || "cs2-map-guesser-assets";
const manifestPath = join(projectRoot, "content", "question-manifest.json");
const recordsPath = join(projectRoot, "content", "imported", "records.json");

function requireArgument(index: number, label: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`MISSING_${label.toUpperCase()}`);
  return value;
}

function printQuestionRows(): void {
  const questions = listRemoteQuestions();
  const meta = getRemoteCatalogMeta();
  for (const question of questions) {
    console.log([
      question.enabled === 1 ? "ENABLED" : "DISABLED",
      `id=${question.id}`,
      `map=${question.map_id}`,
      `layer=${question.layer_id}`,
      `difficulty=${question.difficulty}`,
      `point=${question.correct_x},${question.correct_y}`,
      `key=${question.image_asset_key}`,
      `source=${question.source_preview_id ?? "-"}`,
    ].join(" "));
  }
  console.log(`QUESTION_LIST_COMPLETE Count: ${questions.length} Version: ${meta.version}`);
}

function migrateLegacy(): void {
  type LegacyManifestQuestion = Omit<ManifestQuestion, "difficulty"> & { difficulty?: unknown };
  const manifest = readJson<LegacyManifestQuestion[]>(manifestPath, []);
  const records = readJson<ImportRecord[]>(recordsPath, []);
  if (manifest.length === 0) throw new Error("LEGACY_MANIFEST_EMPTY");

  let inserted = 0;
  let existing = 0;
  for (const question of manifest) {
    const record = records.find((candidate) => candidate.questionId === question.id);
    if (!record) throw new Error(`LEGACY_IMPORT_RECORD_MISSING ${question.id}`);
    const imageAssetKey = `questions/${question.imageAssetId}.webp`;
    const parsedDifficulty = question.difficulty === undefined
      ? { success: true as const, data: "hard" as QuestionDifficulty }
      : QuestionDifficultySchema.safeParse(question.difficulty);
    if (!parsedDifficulty.success) throw new Error(`INVALID_DIFFICULTY ${question.id}`);
    verifyRemoteR2Object(bucket, imageAssetKey);
    const result = insertRemoteQuestion({
      question: { ...question, difficulty: parsedDifficulty.data },
      imageAssetKey,
      contentHash: record.sourceImageSha256,
      sourcePreviewId: record.sourceId,
      createdAt: record.importedAt,
      updatedAt: record.importedAt,
    });
    if (result.row.id !== question.id) {
      throw new Error(`DUPLICATE_CONTENT_HASH existing=${result.row.id} legacy=${question.id}`);
    }
    if (result.row.image_asset_key !== imageAssetKey) {
      throw new Error(`LEGACY_ASSET_KEY_MISMATCH ${question.id}`);
    }
    if (result.inserted) inserted += 1;
    else existing += 1;
    console.log(`${result.inserted ? "MIGRATED" : "EXISTS"} id=${question.id} key=${imageAssetKey}`);
  }

  const remote = listRemoteQuestions();
  const migratedIds = new Set(remote.map((question) => question.id));
  const missing = manifest.filter((question) => !migratedIds.has(question.id));
  if (missing.length > 0) throw new Error(`LEGACY_MIGRATION_INCOMPLETE ${missing.map((question) => question.id).join(",")}`);
  const enabledLegacy = remote.filter(
    (question) => question.enabled === 1 && manifest.some((legacy) => legacy.id === question.id),
  ).length;
  if (enabledLegacy !== manifest.length) {
    throw new Error(`LEGACY_ENABLED_COUNT_MISMATCH expected=${manifest.length} actual=${enabledLegacy}`);
  }
  const meta = getRemoteCatalogMeta();
  console.log(`LEGACY_MIGRATION_COMPLETE Inserted: ${inserted} Existing: ${existing} EnabledLegacy: ${enabledLegacy} Total: ${remote.length} Version: ${meta.version}`);
}

function exportQuestions(): void {
  const backupRoot = join(projectRoot, "backups");
  mkdirSync(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const output = join(backupRoot, `questions-${stamp}.json`);
  const body = {
    exportedAt: new Date().toISOString(),
    catalog: getRemoteCatalogMeta(),
    questions: listRemoteQuestions(),
  };
  writeFileSync(output, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`QUESTIONS_EXPORTED ${output}`);
}

function updatePoint(): void {
  const questionId = requireArgument(3, "question_id");
  const x = Number(requireArgument(4, "x"));
  const y = Number(requireArgument(5, "y"));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("INVALID_POINT");
  updateRemoteQuestionPoint(questionId, x, y);
  console.log(`QUESTION_POINT_UPDATED id=${questionId} point=${x},${y}`);
}

function updateDifficulty(): void {
  const questionId = requireArgument(3, "question_id");
  const difficulty = QuestionDifficultySchema.parse(requireArgument(4, "difficulty").trim().toLowerCase());
  const changed = setRemoteQuestionDifficulty(questionId, difficulty);
  console.log(`QUESTION_DIFFICULTY_UPDATED id=${questionId} difficulty=${difficulty} changed=${changed}`);
}

function main(): void {
  const command = requireArgument(2, "command");
  if (command === "list") return printQuestionRows();
  if (command === "migrate") return migrateLegacy();
  if (command === "export") return exportQuestions();
  if (command === "update-point") return updatePoint();
  if (command === "set-difficulty") return updateDifficulty();
  if (command === "enable" || command === "disable") {
    const questionId = requireArgument(3, "question_id");
    const changed = setRemoteQuestionEnabled(questionId, command === "enable");
    console.log(`QUESTION_${command.toUpperCase()}D id=${questionId} changed=${changed}`);
    return;
  }
  throw new Error(`UNKNOWN_COMMAND ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
