import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { parseGetpos } from "../../src/content/getpos";
import { MAP_IDS, isLayerForMap, type MapId, type RadarLayerId } from "../../src/shared/maps";
import { selectRadarLayer, worldToRadarPoint, type MapOverview, type ViewAngle, type WorldPosition } from "../../src/shared/radarCoordinates";
import type { ManifestQuestion } from "./question-manifest";
import { insertRemoteQuestion, runWrangler, verifyRemoteR2Object } from "./question-d1-admin";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const overviewPath = join(projectRoot, "content", "generated", "map-overviews.json");
const bucket = process.env.R2_BUCKET_NAME || "cs2-map-guesser-assets";

function args(): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument ${key}.`);
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) result.set(key, true);
    else { result.set(key, value); index += 1; }
  }
  return result;
}

function required(values: Map<string, string | true>, name: string): string {
  const value = values.get(name);
  if (typeof value !== "string") throw new Error(`QUESTION_IMPORT_USAGE --image <real screenshot> --map <map> --getpos '<setpos_exact ...;setang_exact ...>'`);
  return value;
}

function upload(path: string, assetId: string): void {
  const key = `questions/${assetId}.webp`;
  const result = runWrangler(["r2", "object", "put", `${bucket}/${key}`, "--file", path, "--content-type", "image/webp", "--remote"], "inherit");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`R2_UPLOAD_FAILED ${key}. D1 was not changed.`);
  verifyRemoteR2Object(bucket, key);
}

async function main() {
  const values = args();
  const imagePath = resolve(required(values, "--image"));
  if (!existsSync(imagePath)) throw new Error(`REAL SCREENSHOT NOT FOUND ${imagePath}`);
  const mapId = required(values, "--map") as MapId;
  if (!MAP_IDS.includes(mapId)) throw new Error(`Unsupported map ${mapId}.`);
  if (!existsSync(overviewPath)) throw new Error("REAL RADAR METADATA REQUIRED. Run npm run radar:sync first.");
  const overviewDocument = JSON.parse(readFileSync(overviewPath, "utf8")) as { maps?: Partial<Record<MapId, MapOverview>> };
  const overview = overviewDocument.maps?.[mapId];
  if (!overview) throw new Error(`REAL RADAR METADATA REQUIRED for ${mapId}. Run npm run radar:sync first.`);
  const capture = parseGetpos(required(values, "--getpos"));
  const automaticLayer = selectRadarLayer(capture.worldPosition, overview);
  const automaticPoint = worldToRadarPoint(capture.worldPosition, overview, automaticLayer);
  const override = typeof values.get("--override-point") === "string"
    ? (values.get("--override-point") as string).split(",").map(Number)
    : null;
  const correctPoint = override ? { x: override[0], y: override[1] } : automaticPoint;
  if (![correctPoint.x, correctPoint.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("Manual override must be normalized x,y within 0..1.");
  }
  const requestedLayer = typeof values.get("--override-layer") === "string" ? values.get("--override-layer") as string : automaticLayer.id;
  if (!isLayerForMap(mapId, requestedLayer)) throw new Error(`Invalid layer ${mapId}/${requestedLayer}.`);
  const layerId = requestedLayer as RadarLayerId;
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 360) {
    throw new Error("REAL SCREENSHOT REQUIRED at 640x360 or larger.");
  }
  const assetId = randomUUID().replaceAll("-", "");
  const questionId = `q-${assetId.slice(0, 12)}`;
  const output = join(projectRoot, "content", "generated", "assets", "questions", `${assetId}.webp`);
  mkdirSync(dirname(output), { recursive: true });
  await sharp(imagePath).rotate().webp({ quality: 88, effort: 6 }).toFile(output);
  const previewParams = new URLSearchParams({
    map: mapId, layer: layerId, x: String(automaticPoint.x), y: String(automaticPoint.y),
    world: `${capture.worldPosition.x},${capture.worldPosition.y},${capture.worldPosition.z}`,
    image: `/@fs/${output.replaceAll("\\", "/")}`,
  });
  console.log(`QA_PREVIEW http://127.0.0.1:5173/dev/question-editor?${previewParams}`);
  if (values.has("--dry-run")) {
    console.log(`DRY_RUN image=${basename(output)} automatic=${JSON.stringify(automaticPoint)} layer=${automaticLayer.id}`);
    return;
  }
  upload(output, assetId);
  const question: ManifestQuestion = {
    id: questionId,
    imageAssetId: assetId,
    correctMapId: mapId,
    correctLayerId: layerId,
    correctPoint,
    automaticPoint,
    worldPosition: capture.worldPosition,
    ...(capture.viewAngle ? { viewAngle: capture.viewAngle } : {}),
    coordinateSource: override || requestedLayer !== automaticLayer.id ? "manual-override" : "world-conversion",
  };
  const contentHash = createHash("sha256").update(readFileSync(imagePath)).digest("hex");
  const result = insertRemoteQuestion({
    question,
    imageAssetKey: `questions/${assetId}.webp`,
    contentHash,
    sourcePreviewId: null,
  });
  if (result.row.id !== questionId) throw new Error(`DUPLICATE_CONTENT_HASH ${result.row.id}`);
  console.log([
    "QUESTION IMPORTED",
    `ID: ${questionId}`,
    `Map: ${mapId}`,
    `World: X ${capture.worldPosition.x} / Y ${capture.worldPosition.y} / Z ${capture.worldPosition.z}`,
    `Radar Layer: ${layerId}`,
    `Radar Point: x ${correctPoint.x} / y ${correctPoint.y}`,
    `R2: questions/${assetId}.webp`,
    `Preview: http://127.0.0.1:5173/dev/question-editor?${previewParams}`,
  ].join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
