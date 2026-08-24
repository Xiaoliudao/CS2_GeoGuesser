import { describe, expect, it } from "vitest";
import type { RadarSourceProvider } from "./radarProvider";
import { selectRadarProvider } from "./radarProvider";

function provider(id: RadarSourceProvider["id"], available: boolean): RadarSourceProvider {
  return { id, isAvailable: async () => available, sync: async () => { throw new Error("not used"); } };
}

describe("radar provider selection", () => {
  it("prefers a valid local CS2 provider", async () => {
    await expect(selectRadarProvider([provider("local-cs2", true), provider("github-extracted", true)]))
      .resolves.toMatchObject({ id: "local-cs2" });
  });

  it("falls back to the public extracted provider", async () => {
    await expect(selectRadarProvider([provider("local-cs2", false), provider("github-extracted", true)]))
      .resolves.toMatchObject({ id: "github-extracted" });
  });
});
