import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ManifestQuestion } from "./question-manifest.ts";

export const QUESTION_DATABASE_NAME = "cs2-map-guesser-db";
export const projectRoot = resolve(import.meta.dirname, "..", "..");

export interface RemoteQuestionRow {
  id: string;
  image_asset_key: string;
  map_id: string;
  layer_id: string;
  correct_x: number;
  correct_y: number;
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  view_pitch: number | null;
  view_yaw: number | null;
  view_roll: number | null;
  automatic_x: number | null;
  automatic_y: number | null;
  coordinate_source: "world-conversion" | "manual-override";
  enabled: number;
  content_hash: string | null;
  source_preview_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteCatalogMeta {
  version: number;
  updated_at: string;
}

export interface RemoteQuestionInput {
  question: ManifestQuestion;
  imageAssetKey: string;
  contentHash: string;
  sourcePreviewId: string | null;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface D1CommandResult<T> {
  results?: T[];
  success: boolean;
  error?: string;
}

function wranglerInvocation(args: string[]) {
  const localWranglerPath = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  if (existsSync(localWranglerPath)) {
    return { command: process.execPath, args: [localWranglerPath, ...args] };
  }
  const npmExecPath = process.env.npm_execpath;
  const npxCliPath = npmExecPath ? join(dirname(npmExecPath), "npx-cli.js") : "";
  const canUseNpxCli = Boolean(npxCliPath && existsSync(npxCliPath));
  return {
    command: canUseNpxCli ? process.execPath : "npx",
    args: canUseNpxCli ? [npxCliPath, "wrangler", ...args] : ["wrangler", ...args],
  };
}

export function runWrangler(args: string[], stdio: "ignore" | "inherit" = "inherit") {
  const invocation = wranglerInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: projectRoot,
    stdio,
    windowsHide: true,
  });
}

export function verifyRemoteR2Object(bucket: string, key: string): void {
  const result = runWrangler(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--pipe"], "ignore");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`R2_OBJECT_NOT_FOUND ${key}`);
}

function runWranglerJson<T>(args: string[]): D1CommandResult<T>[] {
  const invocation = wranglerInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "WRANGLER_D1_FAILED").trim());
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) throw new Error("INVALID_WRANGLER_D1_RESPONSE");
  const commands = parsed as D1CommandResult<T>[];
  const failed = commands.find((command) => !command.success);
  if (failed) throw new Error(failed.error || "WRANGLER_D1_FAILED");
  return commands;
}

export function queryRemoteD1<T>(sql: string): T[] {
  const commands = runWranglerJson<T>([
    "d1",
    "execute",
    QUESTION_DATABASE_NAME,
    "--remote",
    "--command",
    sql,
    "--json",
  ]);
  return commands.flatMap((command) => command.results ?? []);
}

export function executeRemoteD1(sql: string): void {
  runWranglerJson([
    "d1",
    "execute",
    QUESTION_DATABASE_NAME,
    "--remote",
    "--command",
    sql,
    "--json",
  ]);
}

function sqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_D1_VALUE");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${value.replaceAll("'", "''")}'`;
}

function selectQuestionSql(where: string): string {
  return `SELECT
    id, image_asset_key, map_id, layer_id, correct_x, correct_y,
    world_x, world_y, world_z, view_pitch, view_yaw, view_roll,
    automatic_x, automatic_y, coordinate_source, enabled, content_hash,
    source_preview_id, created_at, updated_at
  FROM questions WHERE ${where}`;
}

export function getRemoteQuestion(questionId: string): RemoteQuestionRow | null {
  return queryRemoteD1<RemoteQuestionRow>(`${selectQuestionSql(`id = ${sqlLiteral(questionId)}`)} LIMIT 1`)[0] ?? null;
}

export function getRemoteQuestionByPreviewId(sourcePreviewId: string): RemoteQuestionRow | null {
  return queryRemoteD1<RemoteQuestionRow>(
    `${selectQuestionSql(`source_preview_id = ${sqlLiteral(sourcePreviewId)}`)} LIMIT 1`,
  )[0] ?? null;
}

export function getRemoteQuestionByContentHash(contentHash: string): RemoteQuestionRow | null {
  return queryRemoteD1<RemoteQuestionRow>(
    `${selectQuestionSql(`content_hash = ${sqlLiteral(contentHash)}`)} LIMIT 1`,
  )[0] ?? null;
}

export function listRemoteQuestions(): RemoteQuestionRow[] {
  return queryRemoteD1<RemoteQuestionRow>(`${selectQuestionSql("1 = 1")} ORDER BY created_at, id`);
}

export function getRemoteCatalogMeta(): RemoteCatalogMeta {
  const row = queryRemoteD1<RemoteCatalogMeta>(
    "SELECT version, updated_at FROM question_catalog_meta WHERE id = 1",
  )[0];
  if (!row) throw new Error("QUESTION_CATALOG_META_MISSING");
  return row;
}

export function insertRemoteQuestion(input: RemoteQuestionInput): { inserted: boolean; row: RemoteQuestionRow } {
  const existingById = getRemoteQuestion(input.question.id);
  if (existingById) return { inserted: false, row: existingById };
  const existingByHash = getRemoteQuestionByContentHash(input.contentHash);
  if (existingByHash) return { inserted: false, row: existingByHash };

  const now = new Date().toISOString();
  const question = input.question;
  const values = [
    question.id,
    input.imageAssetKey,
    question.correctMapId,
    question.correctLayerId,
    question.correctPoint.x,
    question.correctPoint.y,
    question.worldPosition?.x ?? null,
    question.worldPosition?.y ?? null,
    question.worldPosition?.z ?? null,
    question.viewAngle?.pitch ?? null,
    question.viewAngle?.yaw ?? null,
    question.viewAngle?.roll ?? null,
    question.automaticPoint?.x ?? null,
    question.automaticPoint?.y ?? null,
    question.coordinateSource,
    input.enabled === false ? 0 : 1,
    input.contentHash,
    input.sourcePreviewId,
    input.createdAt ?? now,
    input.updatedAt ?? now,
  ].map((value) => sqlLiteral(value));

  executeRemoteD1(`
    INSERT OR IGNORE INTO questions (
      id, image_asset_key, map_id, layer_id, correct_x, correct_y,
      world_x, world_y, world_z, view_pitch, view_yaw, view_roll,
      automatic_x, automatic_y, coordinate_source, enabled, content_hash,
      source_preview_id, created_at, updated_at
    ) VALUES (${values.join(", ")});
    UPDATE question_catalog_meta
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 1 AND changes() = 1;
  `);

  const row = getRemoteQuestion(question.id) ?? getRemoteQuestionByContentHash(input.contentHash);
  if (!row) throw new Error(`D1_INSERT_NOT_CONFIRMED ${question.id}`);
  return { inserted: row.id === question.id, row };
}

export function setRemoteQuestionEnabled(questionId: string, enabled: boolean): boolean {
  const before = getRemoteQuestion(questionId);
  if (!before) throw new Error(`QUESTION_NOT_FOUND ${questionId}`);
  if (before.enabled === (enabled ? 1 : 0)) return false;
  executeRemoteD1(`
    UPDATE questions
    SET enabled = ${enabled ? 1 : 0},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ${sqlLiteral(questionId)};
    UPDATE question_catalog_meta
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 1 AND changes() = 1;
  `);
  return true;
}

export function updateRemoteQuestionPoint(
  questionId: string,
  x: number,
  y: number,
  coordinateSource: ManifestQuestion["coordinateSource"] = "manual-override",
): boolean {
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error("POINT_OUT_OF_RANGE");
  if (!getRemoteQuestion(questionId)) throw new Error(`QUESTION_NOT_FOUND ${questionId}`);
  executeRemoteD1(`
    UPDATE questions
    SET correct_x = ${sqlLiteral(x)},
        correct_y = ${sqlLiteral(y)},
        coordinate_source = ${sqlLiteral(coordinateSource)},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ${sqlLiteral(questionId)};
    UPDATE question_catalog_meta
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 1 AND changes() = 1;
  `);
  return true;
}
