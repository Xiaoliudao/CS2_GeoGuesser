import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import { MAPS, type MapId } from "../../src/shared/maps";
import type { MapOverview } from "../../src/shared/radarCoordinates";
import { parseOverview } from "../../src/content/overviewParser";
import { resolveSource2Viewer, runSource2Viewer } from "../../src/content/source2Viewer";
import { locateCS2 } from "../../src/content/steam";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const cacheRoot = join(projectRoot, "content", "cache", "source2viewer");
const generatedRoot = join(projectRoot, "content", "generated");
const radarRoot = join(generatedRoot, "radars");
const imageExtensions = new Set([".png", ".tga", ".jpg", ".jpeg", ".webp"]);

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function selectFile(files: string[], names: string[], extensions?: Set<string>): string {
  const ranked = files
    .filter((file) => !extensions || extensions.has(extname(file).toLowerCase()))
    .map((file) => ({ file, stem: basename(file, extname(file)).toLowerCase() }))
    .filter(({ stem }) => names.some((name) => stem === name || stem === `${name}_psd` || stem.startsWith(`${name}.`)))
    .sort((a, b) => names.indexOf(a.stem.replace(/_psd$/, "")) - names.indexOf(b.stem.replace(/_psd$/, "")));
  if (!ranked[0]) throw new Error(`Extracted file not found: ${names.join(" or ")}.`);
  return ranked[0].file;
}

async function extractMap(map: typeof MAPS[number], extractedFiles: string[], buildId: string): Promise<MapOverview> {
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
    if (!metadata.width || !metadata.height) throw new Error(`Cannot read radar dimensions from ${sourceImage}.`);
    await image.webp({ quality: 92, effort: 6 }).toFile(target);
    dimensions[layer.id] = { width: metadata.width, height: metadata.height };
  }
  return parseOverview(readFileSync(overviewFile, "utf8"), map.id as MapId, map.sourceName, dimensions, buildId);
}

async function main() {
  const installation = locateCS2();
  console.log(`CS2_PATH=${installation.cs2Path}`);
  console.log(`CS2_BUILD_ID=${installation.buildId}`);
  const cli = resolveSource2Viewer();
  const vpk = join(installation.cs2Path, "game", "csgo", "pak01_dir.vpk");
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
  const overviews: Partial<Record<MapId, MapOverview>> = {};
  const failures: string[] = [];
  for (const map of MAPS) {
    try {
      overviews[map.id] = await extractMap(map, extractedFiles, installation.buildId);
      console.log(`EXTRACTED ${map.id} (${map.layers.map((layer) => layer.id).join(", ")})`);
    } catch (error) {
      failures.push(`${map.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`REAL RADAR EXTRACTION INCOMPLETE\n${failures.join("\n")}`);
  writeFileSync(join(generatedRoot, "map-overviews.json"), `${JSON.stringify({
    source: "local-cs2-installation",
    cs2Path: installation.cs2Path,
    sourceBuildId: installation.buildId,
    extractedAt: new Date().toISOString(),
    maps: overviews,
  }, null, 2)}\n`);
  console.log(`WROTE ${join(generatedRoot, "map-overviews.json")}`);
  console.log("NEXT npm run assets:upload -- --radars");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
