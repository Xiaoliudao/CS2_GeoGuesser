import { describe, expect, it } from "vitest";
import { MAP_OVERVIEWS } from "./mapOverviews.generated";
import { MAP_IDS } from "./maps";
import { selectRadarLayer, worldToRadarPoint, type MapOverview } from "./radarCoordinates";

const mirage: MapOverview = {
  mapId: "mirage", sourceName: "de_mirage", posX: -3230, posY: 1713, scale: 5, rotate: 0, zoom: 1,
  layers: [{ id: "main", sourceSectionName: "default", radarWidth: 1024, radarHeight: 1024 }],
  extractedAt: "test", sourceBuildId: "reference-fixture",
};

describe("world to radar conversion", () => {
  it("ships a synchronized runtime overview for every supported map", () => {
    expect(Object.keys(MAP_OVERVIEWS).sort()).toEqual([...MAP_IDS].sort());
  });
  it("uses extracted origin, scale, dimensions, and the overview Y inversion", () => {
    expect(worldToRadarPoint({ x: -3230, y: 1713, z: 0 }, mirage, mirage.layers[0])).toEqual({ x: 0, y: 0 });
    expect(worldToRadarPoint({ x: -670, y: -847, z: 0 }, mirage, mirage.layers[0])).toEqual({ x: 0.5, y: 0.5 });
  });

  it("converts the real Mirage preview smoke-test coordinates", () => {
    const point = worldToRadarPoint({ x: 1365.081055, y: -5.346069, z: -167.96875 }, mirage, mirage.layers[0]);
    expect(point.x).toBeCloseTo(0.897477, 6);
    expect(point.y).toBeCloseTo(0.335614, 6);
  });

  it("does not hide out-of-radar capture errors by clamping", () => {
    expect(() => worldToRadarPoint({ x: -9000, y: 1713, z: 0 }, mirage, mirage.layers[0])).toThrow(/outside/);
  });

  it("applies extracted rotation around the actual image center", () => {
    const rotated = { ...mirage, posX: 0, posY: 0, scale: 1, rotate: 1, layers: [{ ...mirage.layers[0], radarWidth: 100, radarHeight: 100 }] };
    expect(worldToRadarPoint({ x: 60, y: -50, z: 0 }, rotated, rotated.layers[0])).toEqual({ x: 0.5, y: 0.6 });
  });

  it("selects Nuke floors only from extracted altitude sections", () => {
    const nuke: MapOverview = {
      ...mirage, mapId: "nuke", sourceName: "de_nuke", posX: -3453, posY: 2887, scale: 7,
      layers: [
        { id: "upper", sourceSectionName: "default", radarWidth: 1024, radarHeight: 1024, altitudeMin: -495, altitudeMax: 10000 },
        { id: "lower", sourceSectionName: "lower", radarWidth: 1024, radarHeight: 1024, altitudeMin: -10000, altitudeMax: -495 },
      ],
    };
    expect(selectRadarLayer({ x: 0, y: 0, z: -494 }, nuke).id).toBe("upper");
    expect(selectRadarLayer({ x: 0, y: 0, z: -496 }, nuke).id).toBe("lower");
  });
});
