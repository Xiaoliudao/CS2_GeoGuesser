import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RadarProviderResult } from "../../src/content/radarProvider";

export const projectRoot = resolve(import.meta.dirname, "..", "..");
export const generatedRoot = join(projectRoot, "content", "generated");
export const radarRoot = join(generatedRoot, "radars");

export function writeRadarRegistry(result: RadarProviderResult): string {
  mkdirSync(generatedRoot, { recursive: true });
  const path = join(generatedRoot, "map-overviews.json");
  writeFileSync(path, `${JSON.stringify({
    provider: result.provider,
    providerUrl: result.providerUrl,
    sourceBuildId: result.sourceBuildId,
    syncedAt: new Date().toISOString(),
    artifacts: result.artifacts,
    overviews: result.overviews,
    maps: result.maps,
  }, null, 2)}\n`);
  return path;
}
