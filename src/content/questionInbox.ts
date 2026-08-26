import { basename, extname, relative } from "node:path";
import { parseGetpos, type ParsedGetpos } from "./getpos.ts";
import { MAP_IDS, type MapId } from "../shared/maps.ts";
import { QuestionDifficultySchema, type QuestionDifficulty } from "../shared/questionDifficulty.ts";

export type InboxFailureCode =
  | "MISSING_METADATA"
  | "INVALID_MAP"
  | "INVALID_DIFFICULTY"
  | "INVALID_POSITION"
  | "MISSING_OVERVIEW"
  | "FOLDER_MAP_MISMATCH";

export class InboxImportError extends Error {
  constructor(readonly code: InboxFailureCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "InboxImportError";
  }
}

export interface ParsedInboxMetadata extends ParsedGetpos {
  mapId: MapId;
  difficulty?: QuestionDifficulty;
}

export interface InboxPair {
  id: string;
  legacyId: string;
  imagePath: string;
  metadataPath: string;
  relativeSourcePath: string;
  relativeMetadataPath: string;
  folderMapId?: MapId;
}

export interface InboxMatchResult {
  pairs: InboxPair[];
  failures: Array<{
    id: string;
    imagePath: string;
    relativeSourcePath: string;
    code: "MISSING_METADATA";
  }>;
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const MIN_QUESTION_IMAGE_WIDTH = 320;
export const MIN_QUESTION_IMAGE_HEIGHT = 240;

export function hasUsableQuestionImageDimensions(width?: number, height?: number): boolean {
  return Boolean(
    width
    && height
    && width >= MIN_QUESTION_IMAGE_WIDTH
    && height >= MIN_QUESTION_IMAGE_HEIGHT,
  );
}

function portablePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function relativeInboxPath(path: string, inboxRoot?: string): string {
  return portablePath(inboxRoot ? relative(inboxRoot, path) : path);
}

function pathWithoutExtension(path: string): string {
  return path.slice(0, -extname(path).length);
}

function pathSegments(path: string): string[] {
  return portablePath(path).split("/").filter(Boolean);
}

export function normalizeInboxFolderMapId(folderName: string): MapId | null {
  const normalized = folderName
    .trim()
    .toLowerCase()
    .replace(/^de[\s_-]*/, "")
    .replace(/[\s_-]+/g, "");
  if (normalized === "dustii" || normalized === "dust2") return "dust2";
  return MAP_IDS.find((mapId) => mapId === normalized) ?? null;
}

export function previewIdForRelativeSource(relativeSourcePath: string): string {
  const segments = pathSegments(pathWithoutExtension(relativeSourcePath));
  if (segments.length === 0) throw new Error("INVALID_INBOX_SOURCE_PATH");
  if (segments.length > 1) {
    const folderMapId = normalizeInboxFolderMapId(segments[0]);
    if (folderMapId) segments[0] = folderMapId;
  }
  return segments.map((segment) => segment.toLowerCase()).join("/");
}

export function validateInboxFolderMap(pair: InboxPair, metadataMapId: MapId): void {
  if (pair.folderMapId && pair.folderMapId !== metadataMapId) {
    throw new InboxImportError(
      "FOLDER_MAP_MISMATCH",
      `Folder map ${pair.folderMapId} does not match metadata map ${metadataMapId} for ${pair.relativeSourcePath}.`,
    );
  }
}

export function parseInboxMetadata(text: string): ParsedInboxMetadata {
  const mapMatch = text.match(/^\s*map\s*[:=]\s*([a-z0-9_-]+)\s*$/im);
  if (!mapMatch) throw new InboxImportError("MISSING_METADATA", "Expected a map=mirage or map: mirage line.");
  const normalizedMap = mapMatch[1].toLowerCase().replace(/^de_/, "");
  if (!MAP_IDS.includes(normalizedMap as MapId)) {
    throw new InboxImportError("INVALID_MAP", `Unsupported map ${mapMatch[1]}.`);
  }
  const difficultyMatches = [...text.matchAll(/^\s*difficulty\s*[:=]\s*(.*?)\s*$/gim)];
  if (difficultyMatches.length > 1) {
    throw new InboxImportError("INVALID_DIFFICULTY", "Expected at most one difficulty line.");
  }
  const rawDifficulty = difficultyMatches[0]?.[1]?.trim().toLowerCase();
  const parsedDifficulty = rawDifficulty === undefined
    ? null
    : QuestionDifficultySchema.safeParse(rawDifficulty);
  if (parsedDifficulty && !parsedDifficulty.success) {
    throw new InboxImportError(
      "INVALID_DIFFICULTY",
      `Unsupported difficulty ${rawDifficulty || "(empty)"}; expected easy, hard, or hell.`,
    );
  }
  try {
    return {
      mapId: normalizedMap as MapId,
      ...(parsedDifficulty?.success ? { difficulty: parsedDifficulty.data } : {}),
      ...parseGetpos(text),
    };
  } catch (error) {
    throw new InboxImportError("INVALID_POSITION", error instanceof Error ? error.message : String(error));
  }
}

export function matchInboxFiles(paths: readonly string[], inboxRoot?: string): InboxMatchResult {
  const metadataByStem = new Map<string, string>();
  for (const path of paths) {
    if (extname(path).toLowerCase() === ".txt") {
      metadataByStem.set(pathWithoutExtension(relativeInboxPath(path, inboxRoot)).toLowerCase(), path);
    }
  }
  const pairs: InboxPair[] = [];
  const failures: InboxMatchResult["failures"] = [];
  const images = paths
    .filter((path) => imageExtensions.has(extname(path).toLowerCase()))
    .sort((first, second) => relativeInboxPath(first, inboxRoot).localeCompare(relativeInboxPath(second, inboxRoot)));
  for (const imagePath of images) {
    const relativeSourcePath = relativeInboxPath(imagePath, inboxRoot);
    const legacyId = basename(imagePath, extname(imagePath));
    const id = previewIdForRelativeSource(relativeSourcePath);
    const metadataPath = metadataByStem.get(pathWithoutExtension(relativeSourcePath).toLowerCase());
    if (metadataPath) {
      const relativeMetadataPath = relativeInboxPath(metadataPath, inboxRoot);
      const [folderName] = pathSegments(relativeSourcePath);
      const hasFolder = pathSegments(relativeSourcePath).length > 1;
      const folderMapId = hasFolder ? normalizeInboxFolderMapId(folderName) : null;
      pairs.push({
        id,
        legacyId,
        imagePath,
        metadataPath,
        relativeSourcePath,
        relativeMetadataPath,
        ...(folderMapId ? { folderMapId } : {}),
      });
    } else {
      failures.push({ id, imagePath, relativeSourcePath, code: "MISSING_METADATA" });
    }
  }
  return { pairs, failures };
}

export function isDuplicateImageHash(hash: string, records: readonly { sourceImageSha256: string }[]): boolean {
  return records.some((record) => record.sourceImageSha256 === hash);
}
