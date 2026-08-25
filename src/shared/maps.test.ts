import { describe, expect, it } from "vitest";
import { MAPS } from "./maps";

describe("production radar registry", () => {
  it("contains only authenticated media routes and no legacy generated assets", () => {
    for (const map of MAPS) {
      for (const layer of map.layers) {
        expect(layer.radarUrl).toMatch(new RegExp(`^/media/radars/${map.id}/${layer.id}\\?v=`));
        expect(layer.radarUrl).not.toContain("/maps/");
        expect(layer.radarUrl).not.toMatch(/placeholder|\.svg/i);
      }
    }
  });
});
