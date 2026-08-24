import { describe, expect, it } from "vitest";
import { parseOverview } from "./overviewParser";

describe("Valve overview metadata parsing", () => {
  it("reads scalar values and extracted vertical sections", () => {
    const overview = parseOverview(`
      "de_nuke"
      {
        "pos_x" "-3453"
        "pos_y" "2887"
        "scale" "7"
        "rotate" "0"
        "zoom" "1.1"
        "verticalsections"
        {
          "default" { "AltitudeMin" "-495" "AltitudeMax" "10000" }
          "lower" { "AltitudeMin" "-10000" "AltitudeMax" "-495" }
        }
      }
    `, "nuke", "de_nuke", { upper: { width: 1024, height: 1024 }, lower: { width: 1024, height: 1024 } }, "test-build");
    expect(overview).toMatchObject({ posX: -3453, posY: 2887, scale: 7, rotate: 0, zoom: 1.1 });
    expect(overview.layers.map((layer) => ({ id: layer.id, min: layer.altitudeMin, max: layer.altitudeMax }))).toEqual([
      { id: "upper", min: -495, max: 10000 },
      { id: "lower", min: -10000, max: -495 },
    ]);
  });
});
