import { describe, expect, it } from "vitest";
import { mapsForPool } from "./MapSelector";

describe("room map selector", () => {
  it("shows only maps in the server-provided room map pool", () => {
    expect(mapsForPool(["mirage", "inferno", "ancient"]).map((map) => map.id)).toEqual([
      "mirage",
      "inferno",
      "ancient",
    ]);
    expect(mapsForPool(["mirage"]).map((map) => map.id)).toEqual(["mirage"]);
  });
});
