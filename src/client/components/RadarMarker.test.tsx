import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarMarker } from "./RadarMarker";
import { RadarMarkerOverlayContext } from "./radarMarkerOverlayContext";

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

  it("projects a normalized point to an unrounded screen-space position", () => {
    const markup = renderToStaticMarkup(
      <RadarMarkerOverlayContext.Provider value={{
        viewport: { scale: 1.5, translateX: -100, translateY: -100 },
        size: { width: 400, height: 400 },
      }}>
        <RadarMarker
          point={{ x: 0.618427, y: 0.391842 }}
          className="guess-marker"
          label="YOUR GUESS"
          ariaLabel="Projected guess"
        />
      </RadarMarkerOverlayContext.Provider>,
    );
    const left = Number.parseFloat(markup.match(/left:([^;]+)/)?.[1] ?? "NaN");
    const top = Number.parseFloat(markup.match(/top:([^;]+)/)?.[1] ?? "NaN");

    expect(left).toBeCloseTo(271.0562, 10);
    expect(top).toBeCloseTo(135.1052, 10);
    expect(markup).not.toContain("scale(");
  });
});
