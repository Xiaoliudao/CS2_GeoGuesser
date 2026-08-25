import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarMarker } from "./RadarMarker";

describe("RadarMarker", () => {
  it("keeps the full normalized precision in percentage positioning", () => {
    const markup = renderToStaticMarkup(createElement(RadarMarker, {
      point: { x: 0.123456789, y: 0.987654321 },
      className: "guess-marker is-manual",
      label: "YOUR GUESS",
      ariaLabel: "Precise guess",
    }));

    expect(markup).toContain("left:12.3456789%");
    expect(markup).toContain("top:98.7654321%");
  });

  it("separates the hit area, visible marker, center point, and label", () => {
    const markup = renderToStaticMarkup(createElement(RadarMarker, {
      point: { x: 0.5, y: 0.5 },
      className: "result-marker correct-point",
      label: "CORRECT",
      ariaLabel: "Correct point",
    }));

    expect(markup).toContain("radar-marker-hit-area");
    expect(markup).toContain("radar-marker-visual");
    expect(markup).toContain("radar-marker-center");
    expect(markup).toContain("radar-marker-label");
  });
});
