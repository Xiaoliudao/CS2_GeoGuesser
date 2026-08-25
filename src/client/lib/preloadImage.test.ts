import { afterEach, describe, expect, it } from "vitest";
import { ImagePreloadError, clearImagePreloadCacheForTests, preloadImage, type PreloadImageLike } from "./preloadImage";

afterEach(clearImagePreloadCacheForTests);

function fakeImage(onSource: (image: PreloadImageLike) => void): PreloadImageLike {
  let source = "";
  const image: PreloadImageLike = {
    complete: false,
    naturalWidth: 0,
    onload: null,
    onerror: null,
    get src() { return source; },
    set src(value) { source = value; if (value) onSource(image); },
    decode: async () => undefined,
  };
  return image;
}

describe("preloadImage", () => {
  it("loads and decodes a real image object before resolving", async () => {
    const result = await preloadImage("/question.webp", {
      jitterRatio: 0,
      imageFactory: () => fakeImage((image) => queueMicrotask(() => image.onload?.(new Event("load")))),
    });
    expect(result.url).toBe("/question.webp");
    expect(result.attempts).toBe(1);
  });

  it("deduplicates simultaneous downloads for the same URL", async () => {
    let images = 0;
    const imageFactory = () => {
      images += 1;
      return fakeImage((image) => queueMicrotask(() => image.onload?.(new Event("load"))));
    };
    await Promise.all([
      preloadImage("/same.webp", { imageFactory }),
      preloadImage("/same.webp", { imageFactory }),
    ]);
    expect(images).toBe(1);
  });

  it("retries a bounded number of times and reports a safe reason", async () => {
    let images = 0;
    await expect(preloadImage("/missing.webp", {
      retryDelaysMs: [0, 0, 0],
      jitterRatio: 0,
      imageFactory: () => {
        images += 1;
        return fakeImage((image) => queueMicrotask(() => image.onerror?.(new Event("error"))));
      },
    })).rejects.toMatchObject({ reason: "NETWORK", attempts: 3 } satisfies Partial<ImagePreloadError>);
    expect(images).toBe(3);
  });
});
