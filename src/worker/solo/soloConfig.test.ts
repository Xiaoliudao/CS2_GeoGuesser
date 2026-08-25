import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface WranglerConfig {
  durable_objects?: { bindings?: Array<{ name: string; class_name: string }> };
  migrations?: Array<{ tag: string; new_sqlite_classes?: string[] }>;
  assets?: { run_worker_first?: string[] };
}

describe("Solo Cloudflare isolation", () => {
  it("adds a separate local Durable Object without changing the multiplayer namespace", () => {
    const config = JSON.parse(readFileSync(new URL("../../../wrangler.jsonc", import.meta.url), "utf8")) as WranglerConfig;

    expect(config.durable_objects?.bindings).toContainEqual({ name: "GAME_ROOM", class_name: "GameRoom" });
    expect(config.durable_objects?.bindings).toContainEqual({ name: "SOLO_SESSION", class_name: "SoloSession" });
    expect(config.migrations?.find((migration) => migration.tag === "v1")).toEqual({
      tag: "v1",
      new_sqlite_classes: ["GameRoom"],
    });
    expect(config.migrations?.find((migration) => migration.tag === "v2")).toEqual({
      tag: "v2",
      new_sqlite_classes: ["SoloSession"],
    });
    expect(config.assets?.run_worker_first).toEqual(expect.arrayContaining(["/solo", "/solo/*"]));
  });
});
