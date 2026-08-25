import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAPS } from "../shared/maps";

interface RadarRegistry {
  provider: string;
  sourceBuildId: string;
  artifacts: Array<{
    mapId: string;
    layerId: string;
    source: string;
    outputSha256: string;
    width: number;
    height: number;
  }>;
  overviews: Array<{ mapId: string; source: string }>;
  maps: Record<string, {
    sourceName: string;
    sourceBuildId: string;
    layers: Array<{ id: string; radarWidth: number; radarHeight: number }>;
  }>;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("synchronized radar asset and overview pairing", () => {
  it("keeps every map image, overview, dimensions, and build identity paired", () => {
    const projectRoot = resolve(import.meta.dirname, "..", "..");
    const registry = JSON.parse(readFileSync(resolve(projectRoot, "content/generated/map-overviews.json"), "utf8")) as RadarRegistry;
    expect(registry.provider).toBe("github-extracted");

    for (const map of MAPS) {
      const overview = registry.maps[map.id];
      const overviewArtifact = registry.overviews.find((candidate) => candidate.mapId === map.id);
      expect(overview.sourceName, map.id).toBe(map.sourceName);
      expect(overview.sourceBuildId, map.id).toBe(registry.sourceBuildId);
      expect(overviewArtifact?.source, map.id).toContain(`/data/radar_info/${map.sourceName}.txt`);

      for (const layer of map.layers) {
        const artifact = registry.artifacts.find((candidate) => candidate.mapId === map.id && candidate.layerId === layer.id);
        const layerOverview = overview.layers.find((candidate) => candidate.id === layer.id);
        expect(artifact?.source, `${map.id}/${layer.id}`).toContain(`/images/radars/${map.sourceName}`);
        expect(layerOverview, `${map.id}/${layer.id}`).toMatchObject({
          radarWidth: artifact?.width,
          radarHeight: artifact?.height,
        });
        expect(sha256(resolve(projectRoot, `content/generated/radars/${map.id}/${layer.id}.webp`)), `${map.id}/${layer.id}`)
          .toBe(artifact?.outputSha256);
      }
    }
  });
});
