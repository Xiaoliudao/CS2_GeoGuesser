import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InboxImportError,
  hasUsableQuestionImageDimensions,
  isDuplicateImageHash,
  matchInboxFiles,
  normalizeInboxFolderMapId,
  parseInboxMetadata,
  previewIdForRelativeSource,
  validateInboxFolderMap,
} from "./questionInbox";

function codeFrom(action: () => unknown): string | undefined {
  try { action(); } catch (error) { return error instanceof InboxImportError ? error.code : undefined; }
  return undefined;
}

describe("question inbox", () => {
  it("matches images and metadata by case-insensitive stem and reports missing metadata", () => {
    expect(matchInboxFiles(["capture-1.PNG", "capture-1.txt", "capture-2.jpg"])).toEqual({
      pairs: [{
        id: "capture-1",
        legacyId: "capture-1",
        imagePath: "capture-1.PNG",
        metadataPath: "capture-1.txt",
        relativeSourcePath: "capture-1.PNG",
        relativeMetadataPath: "capture-1.txt",
      }],
      failures: [{
        id: "capture-2",
        imagePath: "capture-2.jpg",
        relativeSourcePath: "capture-2.jpg",
        code: "MISSING_METADATA",
      }],
    });
  });

  it("recursively pairs same-directory metadata and creates path-aware preview ids", () => {
    const root = resolve("content", "inbox");
    const result = matchInboxFiles([
      join(root, "Mirage", "shared.jpg"),
      join(root, "Mirage", "shared.txt"),
      join(root, "Inferno", "shared.png"),
      join(root, "Inferno", "shared.txt"),
    ], root);
    expect(result.failures).toEqual([]);
    expect(result.pairs.map((pair) => ({
      id: pair.id,
      legacyId: pair.legacyId,
      relativeSourcePath: pair.relativeSourcePath,
      folderMapId: pair.folderMapId,
    }))).toEqual([
      { id: "inferno/shared", legacyId: "shared", relativeSourcePath: "Inferno/shared.png", folderMapId: "inferno" },
      { id: "mirage/shared", legacyId: "shared", relativeSourcePath: "Mirage/shared.jpg", folderMapId: "mirage" },
    ]);
  });

  it("normalizes map folder spellings but rejects metadata mismatches", () => {
    expect(normalizeInboxFolderMapId("Mirage")).toBe("mirage");
    expect(normalizeInboxFolderMapId("MIRAGE")).toBe("mirage");
    expect(normalizeInboxFolderMapId("Dust II")).toBe("dust2");
    expect(normalizeInboxFolderMapId("dust2")).toBe("dust2");
    expect(previewIdForRelativeSource("Dust II/dust-01.JPEG")).toBe("dust2/dust-01");
    const root = resolve("content", "inbox");
    const pair = matchInboxFiles([
      join(root, "Mirage", "wrong.jpg"),
      join(root, "Mirage", "wrong.txt"),
    ], root).pairs[0];
    expect(codeFrom(() => validateInboxFolderMap(pair, "inferno"))).toBe("FOLDER_MAP_MISMATCH");
  });

  it("accepts both map syntaxes and optional de_ prefixes", () => {
    expect(parseInboxMetadata("map=mirage\nsetpos_exact -1 2 -3\nsetang_exact 4 -5 0").mapId).toBe("mirage");
    expect(parseInboxMetadata("map: de_nuke\nsetpos_exact 1 2 -600").mapId).toBe("nuke");
  });

  it("parses an optional canonical difficulty without breaking legacy metadata", () => {
    expect(parseInboxMetadata("map=mirage\ndifficulty=HELL\nsetpos_exact -1 2 -3").difficulty).toBe("hell");
    expect(parseInboxMetadata("map=mirage\nsetpos_exact -1 2 -3").difficulty).toBeUndefined();
  });

  it("assigns stable failure codes to bad map and position metadata", () => {
    expect(codeFrom(() => parseInboxMetadata("map=office\nsetpos_exact 1 2 3"))).toBe("INVALID_MAP");
    expect(codeFrom(() => parseInboxMetadata("map=mirage\ndifficulty=medium\nsetpos_exact 1 2 3"))).toBe("INVALID_DIFFICULTY");
    expect(codeFrom(() => parseInboxMetadata("map=mirage\ndifficulty=\nsetpos_exact 1 2 3"))).toBe("INVALID_DIFFICULTY");
    expect(codeFrom(() => parseInboxMetadata("map=mirage\ndifficulty=easy\ndifficulty=hell\nsetpos_exact 1 2 3"))).toBe("INVALID_DIFFICULTY");
    expect(codeFrom(() => parseInboxMetadata("map=mirage\nsetpos_exact 1 nope 3"))).toBe("INVALID_POSITION");
    expect(codeFrom(() => parseInboxMetadata("setpos_exact 1 2 3"))).toBe("MISSING_METADATA");
  });

  it("detects duplicate source image hashes", () => {
    expect(isDuplicateImageHash("same", [{ sourceImageSha256: "same" }])).toBe(true);
    expect(isDuplicateImageHash("new", [{ sourceImageSha256: "same" }])).toBe(false);
  });

  it("accepts existing cropped real captures but rejects tiny placeholder images", () => {
    expect(hasUsableQuestionImageDimensions(393, 396)).toBe(true);
    expect(hasUsableQuestionImageDimensions(319, 800)).toBe(false);
    expect(hasUsableQuestionImageDimensions(1920, 239)).toBe(false);
  });
});
