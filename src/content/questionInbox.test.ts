import { describe, expect, it } from "vitest";
import { InboxImportError, isDuplicateImageHash, matchInboxFiles, parseInboxMetadata } from "./questionInbox";

function codeFrom(action: () => unknown): string | undefined {
  try { action(); } catch (error) { return error instanceof InboxImportError ? error.code : undefined; }
  return undefined;
}

describe("question inbox", () => {
  it("matches images and metadata by case-insensitive stem and reports missing metadata", () => {
    expect(matchInboxFiles(["capture-1.PNG", "capture-1.txt", "capture-2.jpg"])).toEqual({
      pairs: [{ id: "capture-1", imagePath: "capture-1.PNG", metadataPath: "capture-1.txt" }],
      failures: [{ id: "capture-2", imagePath: "capture-2.jpg", code: "MISSING_METADATA" }],
    });
  });

  it("accepts both map syntaxes and optional de_ prefixes", () => {
    expect(parseInboxMetadata("map=mirage\nsetpos_exact -1 2 -3\nsetang_exact 4 -5 0").mapId).toBe("mirage");
    expect(parseInboxMetadata("map: de_nuke\nsetpos_exact 1 2 -600").mapId).toBe("nuke");
  });

  it("assigns stable failure codes to bad map and position metadata", () => {
    expect(codeFrom(() => parseInboxMetadata("map=office\nsetpos_exact 1 2 3"))).toBe("INVALID_MAP");
    expect(codeFrom(() => parseInboxMetadata("map=mirage\nsetpos_exact 1 nope 3"))).toBe("INVALID_POSITION");
    expect(codeFrom(() => parseInboxMetadata("setpos_exact 1 2 3"))).toBe("MISSING_METADATA");
  });

  it("detects duplicate source image hashes", () => {
    expect(isDuplicateImageHash("same", [{ sourceImageSha256: "same" }])).toBe(true);
    expect(isDuplicateImageHash("new", [{ sourceImageSha256: "same" }])).toBe(false);
  });
});
