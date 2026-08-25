import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import {
  GAME_IMAGE_RESIZE_OPTIONS,
  RADAR_GAME_MAX_EDGE,
  RADAR_GAME_WEBP_QUALITY,
} from "../../../src/content/imageOptimization";
import { MAPS, type MapId, type RadarLayerId } from "../../../src/shared/maps";
import { parseOverview } from "../../../src/content/overviewParser";
import type { RadarProviderResult, RadarSourceProvider } from "../../../src/content/radarProvider";
import type { MapOverview } from "../../../src/shared/radarCoordinates";
import { radarRoot } from "../radar-registry";

const repositoryUrl = "https://github.com/MurkyYT/cs2-map-icons";
const rawPrefix = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/";
const indexUrl = `${rawPrefix}data/available.json`;
const maxDownloadBytes = 20 * 1024 * 1024;

interface ExtractedMapEntry {
  hash?: string;
  radar_paths?: string[];
  radar_info?: {
    path?: string;
    pos_x?: number;
    pos_y?: number;
    scale?: number;
    rotate?: number;
    zoom?: number;
  };
}

interface ExtractedIndex { maps?: Record<string, ExtractedMapEntry> }

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertAllowedUrl(url: string): void {
  if (!url.startsWith(rawPrefix)) throw new Error(`UNTRUSTED_RADAR_SOURCE ${url}`);
}

async function download(url: string): Promise<Buffer> {
  assertAllowedUrl(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!response.ok) throw new Error(`RADAR_DOWNLOAD_FAILED ${response.status} ${url}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxDownloadBytes) throw new Error(`RADAR_DOWNLOAD_TOO_LARGE ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxDownloadBytes) throw new Error(`INVALID_RADAR_DOWNLOAD_SIZE ${url}`);
  return bytes;
}

function sourceForLayer(entry: ExtractedMapEntry, sourceName: string, layerId: RadarLayerId): string {
  const paths = entry.radar_paths ?? [];
  const expectedNames = layerId === "lower"
    ? [`${sourceName}_lower_radar_psd.png`, `${sourceName}_lower_radar.png`]
    : [`${sourceName}_radar_psd.png`, `${sourceName}_radar.png`];
  const path = paths.find((candidate) => expectedNames.includes(basename(new URL(candidate).pathname).toLowerCase()));
  if (!path) throw new Error(`MISSING_REAL_RADAR ${sourceName}/${layerId}`);
  assertAllowedUrl(path);
  return path;
}

function validateIndexedMetadata(entry: ExtractedMapEntry, overview: MapOverview): void {
  const indexed = entry.radar_info;
  if (!indexed) throw new Error(`MISSING_OVERVIEW ${overview.sourceName}`);
  const comparisons: Array<[string, number | undefined, number]> = [
    ["pos_x", indexed.pos_x, overview.posX], ["pos_y", indexed.pos_y, overview.posY],
    ["scale", indexed.scale, overview.scale], ["rotate", indexed.rotate, overview.rotate], ["zoom", indexed.zoom, overview.zoom],
  ];
  for (const [field, expected, actual] of comparisons) {
    if (expected !== undefined && expected !== actual) throw new Error(`OVERVIEW_INDEX_MISMATCH ${overview.sourceName}.${field}`);
  }
}

export class GitHubExtractedRadarProvider implements RadarSourceProvider {
  readonly id = "github-extracted" as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async sync(): Promise<RadarProviderResult> {
    const indexBytes = await download(indexUrl);
    const index = JSON.parse(new TextDecoder().decode(indexBytes)) as ExtractedIndex;
    if (!index.maps || typeof index.maps !== "object") throw new Error("INVALID_RADAR_PROVIDER_INDEX");
    const sourceBuildId = `github-index:${sha256(indexBytes).slice(0, 16)}`;
    const maps: Partial<Record<MapId, MapOverview>> = {};
    const artifacts: RadarProviderResult["artifacts"] = [];
    const overviews: RadarProviderResult["overviews"] = [];

    for (const map of MAPS) {
      const entry = index.maps[map.sourceName];
      if (!entry || !entry.radar_info?.path) throw new Error(`MISSING_SUPPORTED_MAP ${map.sourceName}`);
      assertAllowedUrl(entry.radar_info.path);
      const dimensions: Record<string, { width: number; height: number }> = {};
      for (const layer of map.layers) {
        const sourceUrl = sourceForLayer(entry, map.sourceName, layer.id);
        const sourceBytes = await download(sourceUrl);
        const image = sharp(sourceBytes, { failOn: "error" });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height || metadata.width !== metadata.height || metadata.width < 512) {
          throw new Error(`INVALID_RADAR_DIMENSIONS ${map.sourceName}/${layer.id}`);
        }
        const targetDirectory = join(radarRoot, map.id);
        const target = join(targetDirectory, `${layer.id}.webp`);
        mkdirSync(targetDirectory, { recursive: true });
        const output = await image
          .resize({ width: RADAR_GAME_MAX_EDGE, height: RADAR_GAME_MAX_EDGE, ...GAME_IMAGE_RESIZE_OPTIONS })
          .webp({ quality: RADAR_GAME_WEBP_QUALITY, effort: 6 })
          .toBuffer();
        writeFileSync(target, output);
        const outputMetadata = await sharp(output).metadata();
        if (!outputMetadata.width || !outputMetadata.height) throw new Error(`INVALID_GENERATED_RADAR ${map.sourceName}/${layer.id}`);
        dimensions[layer.id] = { width: outputMetadata.width, height: outputMetadata.height };
        artifacts.push({
          mapId: map.id,
          layerId: layer.id,
          source: sourceUrl,
          sourceSha256: sha256(sourceBytes),
          outputSha256: sha256(output),
          width: outputMetadata.width,
          height: outputMetadata.height,
        });
      }
      const overviewBytes = await download(entry.radar_info.path);
      const overview = parseOverview(new TextDecoder().decode(overviewBytes), map.id, map.sourceName, dimensions, sourceBuildId);
      validateIndexedMetadata(entry, overview);
      maps[map.id] = overview;
      overviews.push({ mapId: map.id, source: entry.radar_info.path, sourceSha256: sha256(overviewBytes) });
      console.log(`SYNCED ${map.sourceName} (${map.layers.map((layer) => layer.id).join(", ")})`);
    }
    return { provider: this.id, providerUrl: repositoryUrl, sourceBuildId, maps, artifacts, overviews };
  }
}
