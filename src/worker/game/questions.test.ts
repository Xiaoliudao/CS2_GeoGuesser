import { describe, expect, it } from "vitest";
import type { Question } from "./questions";
import { toPublicQuestion } from "./questions";

describe("playing-state question privacy", () => {
  it("exposes only opaque identifiers and never server answer metadata", () => {
    const testOnlyQuestion: Question = {
      id: "q-0123456789ab",
      imageAssetId: "0123456789abcdef",
      correctMapId: "nuke",
      correctLayerId: "lower",
      correctPoint: { x: 0.42, y: 0.61 },
      worldPosition: { x: 100, y: 200, z: -600 },
      viewAngle: { pitch: 1, yaw: 90, roll: 0 },
      coordinateSource: "world-conversion",
    };
    const publicQuestion = toPublicQuestion(testOnlyQuestion);
    expect(publicQuestion).toEqual({
      questionId: "q-0123456789ab",
      imageUrl: "/media/questions/0123456789abcdef",
    });
    const payload = JSON.stringify(publicQuestion);
    for (const secret of ["correctMapId", "correctLayerId", "correctPoint", "worldPosition", "viewAngle", "nuke", "lower", "0.42"]) {
      expect(payload).not.toContain(secret);
    }
  });
});
