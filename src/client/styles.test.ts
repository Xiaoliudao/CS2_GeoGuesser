import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const start = stylesheet.indexOf(`${selector} {`);
  expect(start, `Missing CSS rule for ${selector}`).toBeGreaterThanOrEqual(0);
  const end = stylesheet.indexOf("}", start);
  expect(end, `Unclosed CSS rule for ${selector}`).toBeGreaterThan(start);
  return stylesheet.slice(start, end + 1);
}

describe("room stacking order", () => {
  it("contains radar controls inside an isolated stacking context below the sticky header", () => {
    expect(ruleBody(".radar-image-wrap")).toContain("isolation: isolate");
    expect(ruleBody(".radar-zoom-controls")).toContain("z-index: 20");
    expect(ruleBody(".room-header")).toContain("position: sticky");
    expect(ruleBody(".room-header")).toContain("z-index: 10");
  });
});
