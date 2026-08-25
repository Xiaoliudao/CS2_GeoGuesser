import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaResponse, questionMediaResponse, questionObjectKey, radarObjectKey } from "./media";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R2 media routing", () => {
  it("uses the same question object key as the uploader", () => {
    expect(questionObjectKey("0123456789abcdef")).toBe("questions/0123456789abcdef.webp");
  });

  it("uses the same radar object key as the uploader", () => {
    expect(radarObjectKey("ancient", "main")).toBe("radars/ancient/main.webp");
  });

  it("resolves an opaque question id through D1 before reading the R2 object key", async () => {
    const requestedKeys: string[] = [];
    const response = await questionMediaResponse(
      new Request("http://localhost/media/questions/q-opaque1234567"),
      { getImageAssetKey: async (questionId) => questionId === "q-opaque1234567" ? "questions/asset.webp" : null },
      {
        async get(key) {
          requestedKeys.push(key);
          return {
            body: new Blob(["question"]).stream(),
            httpEtag: '"question-etag"',
            writeHttpMetadata(headers) { headers.set("content-type", "image/webp"); },
          };
        },
      },
      "q-opaque1234567",
    );

    expect(response.status).toBe(200);
    expect(requestedKeys).toEqual(["questions/asset.webp"]);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("returns 404 without touching R2 when the question id is missing from D1", async () => {
    let r2Reads = 0;
    const response = await questionMediaResponse(
      new Request("http://localhost/media/questions/q-missing123456"),
      { getImageAssetKey: async () => null },
      { get: async () => { r2Reads += 1; return null; } },
      "q-missing123456",
    );
    expect(response.status).toBe(404);
    expect(r2Reads).toBe(0);
    await expect(response.json()).resolves.toEqual({ error: "QUESTION_NOT_FOUND", questionId: "q-missing123456" });
  });

  it("does not expose the private R2 asset key when a mapped question object is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await questionMediaResponse(
      new Request("http://localhost/media/questions/q-opaque1234567"),
      { getImageAssetKey: async () => "questions/private-asset-id.webp" },
      { get: async () => null },
      "q-opaque1234567",
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("QUESTION_MEDIA_NOT_FOUND");
    expect(body).not.toContain("private-asset-id");
  });

  it("returns a useful 404 and logs the missing R2 object key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const key = questionObjectKey("missingasset12");
    const response = await mediaResponse(
      new Request("http://localhost/media/questions/missingasset12"),
      { get: async () => null },
      key,
      "public, max-age=3600",
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "R2_OBJECT_NOT_FOUND",
      binding: "GAME_ASSETS",
      key,
    });
    expect(error).toHaveBeenCalledWith(JSON.stringify({
      error: "R2_OBJECT_NOT_FOUND",
      binding: "GAME_ASSETS",
      key,
    }));
  });

  it("streams the object and propagates content type, ETag, and cache headers", async () => {
    const requestedKeys: string[] = [];
    const key = radarObjectKey("mirage", "main");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("real-radar"));
        controller.close();
      },
    });
    const response = await mediaResponse(
      new Request("http://localhost/media/radars/mirage/main"),
      {
        async get(requestedKey) {
          requestedKeys.push(requestedKey);
          return {
            body,
            httpEtag: '"radar-etag"',
            writeHttpMetadata(headers) {
              headers.set("content-type", "image/webp");
            },
          };
        },
      },
      key,
      "public, max-age=86400",
    );

    expect(requestedKeys).toEqual([key]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("etag")).toBe('"radar-etag"');
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("real-radar");
  });
});
