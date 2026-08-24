import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { parseOverview } from "../../../src/content/overviewParser";
import type { RadarProviderResult, RadarSourceProvider } from "../../../src/content/radarProvider";
import { resolveSource2Viewer, runSource2Viewer } from "../../../src/content/source2Viewer";
import { locateCS2 } from "../../../src/content/steam";
import { MAPS, type MapId } from "../../../src/shared/maps";
import type { MapOverview } from "../../../src/shared/radarCoordinates";
import { generatedRoot, radarRoot } from "../radar-registry";

const imageExtensions = new Set([".png", ".tga", ".jpg", ".jpeg", ".webp"]);

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function selectFile(files: string[], names: string[], extensions: Set<string>): string {
  const candidates = files
    .filter((file) => extensions.has(extname(file).toLowerCase()))
    .map((file) => ({ file, stem: basename(file, extname(file)).toLowerCase() }))
    .filter(({ stem }) => names.some((name) => stem === name || stem === `${name}_psd`));
  const selected = candidates.sort((left, right) => {
    const rank = (stem: string) => names.findIndex((name) => stem === name || stem === `${name}_psd`);
    return rank(left.stem) - rank(right.stem);
  })[0];
  if (!selected) throw new Error(`Extracted file not found: ${names.join(" or ")}.`);
  return selected.file;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export class LocalCS2RadarProvider implements RadarSourceProvider {
  readonly id = "local-cs2" as const;

  async isAvailable(): Promise<boolean> {
    try {
      locateCS2();
      resolveSource2Viewer();
      return true;
    } catch {
      return false;
    }
  }

  async sync(): Promise<RadarProviderResult> {
    const installation = locateCS2();
    const cli = resolveSource2Viewer();
    const vpk = join(installation.cs2Path, "game", "csgo", "pak01_dir.vpk");
    const cacheRoot = join(generatedRoot, "..", "cache", "source2viewer");
    mkdirSync(cacheRoot, { recursive: true });
    mkdirSync(radarRoot, { recursive: true });
    runSource2Viewer(cli, [
      "-i", vpk,
      "-o", cacheRoot,
      "-f", "resource/overviews/,panorama/images/overheadmaps/",
      "-e", "txt,vtex_c",
      "-d",
    ]);

    const extractedFiles = filesBelow(cacheRoot);
    const maps: Partial<Record<MapId, MapOverview>> = {};
    const artifacts: RadarProviderResult["artifacts"] = [];
    const overviews: RadarProviderResult["overviews"] = [];
    for (const map of MAPS) {
      const overviewFile = selectFile(extractedFiles, [map.sourceName], new Set([".txt"]));
      const dimensions: Record<string, { width: number; height: number }> = {};
      for (const layer of map.layers) {
        const sourceNames = layer.id === "lower"
          ? [`${map.sourceName}_lower_radar`, `${map.sourceName}_radar_lower`]
          : [`${map.sourceName}_radar`];
        const sourceImage = selectFile(extractedFiles, sourceNames, imageExtensions);
        const targetDirectory = join(radarRoot, map.id);
        const target = join(targetDirectory, `${layer.id}.webp`);
        mkdirSync(targetDirectory, { recursive: true });
        const image = sharp(sourceImage, { failOn: "error" });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height || metadata.width !== metadata.height || metadata.width < 512) {
          throw new Error(`INVALID_RADAR_DIMENSIONS ${map.sourceName}/${layer.id}`);
        }
        await image.webp({ quality: 92, effort: 6 }).toFile(target);
        dimensions[layer.id] = { width: metadata.width, height: metadata.height };
        artifacts.push({
          mapId: map.id,
          layerId: layer.id,
          source: `local-vpk:${basename(sourceImage)}`,
          sourceSha256: sha256(sourceImage),
          outputSha256: sha256(target),
          width: metadata.width,
          height: metadata.height,
        });
      }
      maps[map.id] = parseOverview(readFileSync(overviewFile, "utf8"), map.id, map.sourceName, dimensions, installation.buildId);
      overviews.push({ mapId: map.id, source: `local-vpk:${basename(overviewFile)}`, sourceSha256: sha256(overviewFile) });
      console.log(`SYNCED ${map.sourceName} (${map.layers.map((layer) => layer.id).join(", ")})`);
    }
    return {
      provider: this.id,
      providerUrl: "https://github.com/ValveResourceFormat/ValveResourceFormat",
      sourceBuildId: installation.buildId,
      maps,
      artifacts,
      overviews,
    };
  }
}
