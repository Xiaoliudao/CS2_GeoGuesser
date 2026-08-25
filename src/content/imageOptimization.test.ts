import { describe, expect, it } from "vitest";
import {
  QUESTION_GAME_MAX_EDGE,
  QUESTION_GAME_WEBP_QUALITY,
  RADAR_GAME_MAX_EDGE,
  RADAR_GAME_WEBP_QUALITY,
} from "./imageOptimization";

describe("game media optimization defaults", () => {
  it("keeps screenshots detailed but bounded for high-latency delivery", () => {
    expect(QUESTION_GAME_MAX_EDGE).toBeGreaterThanOrEqual(1_280);
    expect(QUESTION_GAME_MAX_EDGE).toBeLessThanOrEqual(1_440);
    expect(QUESTION_GAME_WEBP_QUALITY).toBeGreaterThanOrEqual(75);
    expect(QUESTION_GAME_WEBP_QUALITY).toBeLessThanOrEqual(85);
  });

  it("keeps radar assets within the gameplay target", () => {
    expect(RADAR_GAME_MAX_EDGE).toBeGreaterThanOrEqual(512);
    expect(RADAR_GAME_MAX_EDGE).toBeLessThanOrEqual(1_024);
    expect(RADAR_GAME_WEBP_QUALITY).toBeLessThanOrEqual(85);
  });
});
