import { getMapOverview } from "../../src/shared/mapOverviews.generated.ts";
import { getRadarLayer, MAP_IDS, type MapId } from "../../src/shared/maps.ts";
import { selectRadarLayer, worldToRadarPoint } from "../../src/shared/radarCoordinates.ts";
import type { MapPoint } from "../../src/shared/types.ts";
import { listRemoteQuestions } from "./question-d1-admin.ts";

const tolerance = 1e-9;

function point(x: number | null, y: number | null): MapPoint | null {
  return x === null || y === null ? null : { x, y };
}

function difference(left: MapPoint, right: MapPoint): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function label(value: MapPoint | null): string {
  return value ? `${value.x.toFixed(9)},${value.y.toFixed(9)}` : "missing";
}

function main(): void {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("DRY_RUN_REQUIRED. This audit never modifies D1; run npm run questions:recalculate-coordinates -- --dry-run.");
  }

  const questions = listRemoteQuestions();
  let recalculated = 0;
  let changedAutomatic = 0;
  let affectedFinal = 0;
  let manualOverridesPreserved = 0;
  let missingWorldPosition = 0;
  let failures = 0;

  for (const question of questions) {
    if (question.world_x === null || question.world_y === null || question.world_z === null) {
      missingWorldPosition += 1;
      continue;
    }
    if (!MAP_IDS.includes(question.map_id as MapId)) {
      console.error(`RECALCULATE_FAILED id=${question.id} reason=INVALID_MAP map=${question.map_id}`);
      failures += 1;
      continue;
    }

    try {
      const mapId = question.map_id as MapId;
      const worldPosition = { x: question.world_x, y: question.world_y, z: question.world_z };
      const overview = getMapOverview(mapId);
      const layer = selectRadarLayer(worldPosition, overview);
      if (!getRadarLayer(mapId, layer.id) || layer.id !== question.layer_id) {
        throw new Error(`LAYER_MISMATCH stored=${question.layer_id} calculated=${layer.id}`);
      }
      const nextAutomatic = worldToRadarPoint(worldPosition, overview, layer);
      const oldAutomatic = point(question.automatic_x, question.automatic_y);
      const oldFinal = { x: question.correct_x, y: question.correct_y };
      const automaticDelta = oldAutomatic ? difference(oldAutomatic, nextAutomatic) : Number.POSITIVE_INFINITY;
      const finalDelta = difference(oldFinal, nextAutomatic);
      const automaticChanged = automaticDelta > tolerance;
      const finalChanged = question.coordinate_source === "world-conversion" && finalDelta > tolerance;

      recalculated += 1;
      if (automaticChanged) changedAutomatic += 1;
      if (finalChanged) affectedFinal += 1;
      if (question.coordinate_source === "manual-override") manualOverridesPreserved += 1;

      if (automaticChanged || finalChanged) {
        console.log([
          finalChanged ? "AFFECTED" : "MANUAL_OVERRIDE_PRESERVED",
          `id=${question.id}`,
          `map=${mapId}`,
          `layer=${layer.id}`,
          `source=${question.coordinate_source}`,
          `oldAutomatic=${label(oldAutomatic)}`,
          `oldFinal=${label(oldFinal)}`,
          `newAutomatic=${label(nextAutomatic)}`,
          `automaticDelta=${Number.isFinite(automaticDelta) ? automaticDelta : "missing"}`,
          `finalDelta=${finalDelta}`,
        ].join(" "));
      }
    } catch (error) {
      console.error(`RECALCULATE_FAILED id=${question.id} reason=${error instanceof Error ? error.message : String(error)}`);
      failures += 1;
    }
  }

  console.log([
    "QUESTION_COORDINATE_RECALCULATION_COMPLETE",
    `Scanned: ${questions.length}`,
    `Recalculated: ${recalculated}`,
    `ChangedAutomatic: ${changedAutomatic}`,
    `AffectedFinal: ${affectedFinal}`,
    `ManualOverridesPreserved: ${manualOverridesPreserved}`,
    `MissingWorldPosition: ${missingWorldPosition}`,
    `Failed: ${failures}`,
    "DryRun: true",
  ].join(" "));
  if (failures > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
