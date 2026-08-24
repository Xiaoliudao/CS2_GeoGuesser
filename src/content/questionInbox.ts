import { basename, extname } from "node:path";
import { parseGetpos, type ParsedGetpos } from "./getpos";
import { MAP_IDS, type MapId } from "../shared/maps";

export type InboxFailureCode = "MISSING_METADATA" | "INVALID_MAP" | "INVALID_POSITION" | "MISSING_OVERVIEW";

export class InboxImportError extends Error {
  constructor(readonly code: InboxFailureCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "InboxImportError";
  }
}

export interface ParsedInboxMetadata extends ParsedGetpos {
  mapId: MapId;
}

export interface InboxPair {
  id: string;
  imagePath: string;
  metadataPath: string;
}

export interface InboxMatchResult {
  pairs: InboxPair[];
  failures: Array<{ id: string; imagePath: string; code: "MISSING_METADATA" }>;
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function parseInboxMetadata(text: string): ParsedInboxMetadata {
  const mapMatch = text.match(/^\s*map\s*[:=]\s*([a-z0-9_-]+)\s*$/im);
  if (!mapMatch) throw new InboxImportError("MISSING_METADATA", "Expected a map=mirage or map: mirage line.");
  const normalizedMap = mapMatch[1].toLowerCase().replace(/^de_/, "");
  if (!MAP_IDS.includes(normalizedMap as MapId)) {
    throw new InboxImportError("INVALID_MAP", `Unsupported map ${mapMatch[1]}.`);
  }
  try {
    return { mapId: normalizedMap as MapId, ...parseGetpos(text) };
  } catch (error) {
    throw new InboxImportError("INVALID_POSITION", error instanceof Error ? error.message : String(error));
  }
}

export function matchInboxFiles(paths: readonly string[]): InboxMatchResult {
  const metadataByStem = new Map<string, string>();
  for (const path of paths) {
    if (extname(path).toLowerCase() === ".txt") metadataByStem.set(basename(path, extname(path)).toLowerCase(), path);
  }
  const pairs: InboxPair[] = [];
  const failures: InboxMatchResult["failures"] = [];
  for (const imagePath of paths.filter((path) => imageExtensions.has(extname(path).toLowerCase())).sort()) {
    const id = basename(imagePath, extname(imagePath));
    const metadataPath = metadataByStem.get(id.toLowerCase());
    if (metadataPath) pairs.push({ id, imagePath, metadataPath });
    else failures.push({ id, imagePath, code: "MISSING_METADATA" });
  }
  return { pairs, failures };
}

export function isDuplicateImageHash(hash: string, records: readonly { sourceImageSha256: string }[]): boolean {
  return records.some((record) => record.sourceImageSha256 === hash);
}
