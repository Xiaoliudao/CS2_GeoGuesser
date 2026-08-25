import { describe, expect, it } from "vitest";
import { MAP_OVERVIEWS } from "./mapOverviews.generated";
import { MAP_IDS } from "./maps";
import { selectRadarLayer, traceWorldToRadarPoint, worldToRadarPoint, type MapOverview } from "./radarCoordinates";

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

  it("does not apply Valve presentation rotation to an already oriented radar asset", () => {
    const rotated = { ...mirage, posX: 0, posY: 0, scale: 1, rotate: 1, layers: [{ ...mirage.layers[0], radarWidth: 100, radarHeight: 100 }] };
    expect(worldToRadarPoint({ x: 60, y: -50, z: 0 }, rotated, rotated.layers[0])).toEqual({ x: 0.6, y: 0.5 });
  });

  it("keeps every synchronized map in the same top-left normalized coordinate system", () => {
    for (const overview of Object.values(MAP_OVERVIEWS)) {
      for (const layer of overview.layers) {
        const world = {
          x: overview.posX + layer.radarWidth * overview.scale * 0.25,
          y: overview.posY - layer.radarHeight * overview.scale * 0.75,
          z: layer.altitudeMin ?? 0,
        };
        const point = worldToRadarPoint(world, overview, layer);
        expect(point.x, `${overview.mapId}/${layer.id} x`).toBeCloseTo(0.25, 12);
        expect(point.y, `${overview.mapId}/${layer.id} y`).toBeCloseTo(0.75, 12);
      }
    }
  });

  it("maps the real Dust II position to the verified lower-left region", () => {
    const overview = MAP_OVERVIEWS.dust2;
    const world = { x: -1248.585815, y: -246.164001, z: 191.263901 };
    const diagnostic = traceWorldToRadarPoint(world, overview, overview.layers[0]);
    expect(diagnostic).toMatchObject({
      overview: { posX: -2476, posY: 3239, scale: 4.4, rotate: 1 },
      coordinateTransform: "none",
      rotateMetadataApplied: false,
      radarWidth: 1024,
      radarHeight: 1024,
    });
    expect(diagnostic.rawPixelX).toBeCloseTo(278.957769318, 9);
    expect(diagnostic.rawPixelY).toBeCloseTo(792.0827275, 9);
    expect(diagnostic.final.x).toBeCloseTo(0.2724196966, 9);
    expect(diagnostic.final.y).toBeCloseTo(0.7735182886, 9);
    expect(diagnostic.final.x).toBeLessThan(0.5);
    expect(diagnostic.final.y).toBeGreaterThan(0.5);
  });

  it("matches Dust II overview landmarks spread across the displayed asset", () => {
    const overview = MAP_OVERVIEWS.dust2;
    const layer = overview.layers[0];
    const landmarks = [
      { name: "T spawn", point: { x: 0.39, y: 0.91 } },
      { name: "CT spawn", point: { x: 0.62, y: 0.21 } },
      { name: "A site", point: { x: 0.8, y: 0.16 } },
      { name: "B site", point: { x: 0.21, y: 0.12 } },
      { name: "center", point: { x: 0.5, y: 0.5 } },
    ];
    for (const landmark of landmarks) {
      const world = {
        x: overview.posX + landmark.point.x * layer.radarWidth * overview.scale,
        y: overview.posY - landmark.point.y * layer.radarHeight * overview.scale,
        z: 0,
      };
      const point = worldToRadarPoint(world, overview, layer);
      expect(point.x, `${landmark.name} x`).toBeCloseTo(landmark.point.x, 12);
      expect(point.y, `${landmark.name} y`).toBeCloseTo(landmark.point.y, 12);
    }
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
