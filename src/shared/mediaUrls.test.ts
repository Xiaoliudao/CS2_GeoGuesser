import { describe, expect, it } from "vitest";
import { RADAR_ASSET_VERSION, normalizePublicOrigin, questionMediaUrl, radarMediaUrl } from "./mediaUrls";

describe("configuration-driven media URLs", () => {
  it("uses relative Worker proxy routes by default", () => {
    expect(questionMediaUrl("q-opaque123456", "questions/private.webp")).toBe("/media/questions/q-opaque123456");
    expect(radarMediaUrl("mirage", "main")).toBe(`/media/radars/mirage/main?v=${RADAR_ASSET_VERSION}`);
  });

  it("uses a validated custom asset origin without exposing credentials", () => {
    expect(questionMediaUrl("q-opaque123456", "questions/game image.webp", "https://assets.example.com/path"))
      .toBe("https://assets.example.com/questions/game%20image.webp");
    expect(radarMediaUrl("nuke", "lower", "https://assets.example.com"))
      .toBe(`https://assets.example.com/radars/nuke/lower.webp?v=${RADAR_ASSET_VERSION}`);
  });

  it("rejects non-http origins and strips paths", () => {
    expect(normalizePublicOrigin("javascript:alert(1)")).toBe("");
    expect(normalizePublicOrigin("https://assets.example.com/ignored/path")).toBe("https://assets.example.com");
  });
});
