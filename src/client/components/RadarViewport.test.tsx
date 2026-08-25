// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RadarMarker } from "./RadarMarker";
import { RadarViewport } from "./RadarViewport";

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

function prepareRadar(onPointSelect = vi.fn()) {
  render(<RadarViewport src="/radar.webp" alt="Test radar" pointSelectionEnabled onPointSelect={onPointSelect} />);
  const surface = document.querySelector(".radar-gesture-surface") as HTMLDivElement;
  Object.defineProperty(surface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 100, top: 50, width: 400, height: 400, right: 500, bottom: 450, x: 100, y: 50, toJSON: () => ({}) }),
  });
  fireEvent.load(screen.getByRole("img", { name: "Test radar" }));
  return { surface, onPointSelect };
}

beforeEach(() => {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
});

afterEach(() => cleanup());

describe("RadarViewport interactions", () => {
  it("places one precise normalized point for a short tap", () => {
    const { surface, onPointSelect } = prepareRadar();

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300.123456, clientY: 250.654321 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300.123456, clientY: 250.654321 });

    expect(onPointSelect).toHaveBeenCalledTimes(1);
    expect(onPointSelect.mock.calls[0][0].x).toBeCloseTo((300.123456 - 100) / 400, 12);
    expect(onPointSelect.mock.calls[0][0].y).toBeCloseTo((250.654321 - 50) / 400, 12);
  });

  it("pans after a drag without placing a point on release", () => {
    const { surface, onPointSelect } = prepareRadar();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 250, clientY: 220 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 250, clientY: 220 });

    expect(onPointSelect).not.toHaveBeenCalled();
    expect((document.querySelector(".radar-transform-layer") as HTMLElement).style.transform).toContain("translate3d(-150px, -130px, 0)");
  });

  it("treats a single-finger touch drag as pan rather than a tap", () => {
    const { surface, onPointSelect } = prepareRadar();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    fireEvent.pointerDown(surface, { pointerId: 9, pointerType: "touch", clientX: 320, clientY: 260 });
    fireEvent.pointerMove(surface, { pointerId: 9, pointerType: "touch", clientX: 280, clientY: 230 });
    fireEvent.pointerUp(surface, { pointerId: 9, pointerType: "touch", clientX: 280, clientY: 230 });

    expect(onPointSelect).not.toHaveBeenCalled();
    expect((document.querySelector(".radar-transform-layer") as HTMLElement).style.transform).toContain("translate3d(-140px, -130px, 0)");
  });

  it("pinch zooms with two touch pointers and never places a marker", () => {
    const { surface, onPointSelect } = prepareRadar();

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "touch", clientX: 250, clientY: 250 });
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: "touch", clientX: 350, clientY: 250 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 250 });
    fireEvent.pointerMove(surface, { pointerId: 2, pointerType: "touch", clientX: 400, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "touch", clientX: 400, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 250 });

    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("2.0×");
    expect(onPointSelect).not.toHaveBeenCalled();
  });

  it("supports pointer-centered wheel zoom and reset without selecting a point", () => {
    const { surface, onPointSelect } = prepareRadar();

    fireEvent.wheel(surface, { clientX: 260, clientY: 210, deltaY: -100 });
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("1.5×");
    fireEvent.click(screen.getByRole("button", { name: "Reset radar view" }));

    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("1.0×");
    expect(onPointSelect).not.toHaveBeenCalled();
  });

  it("keeps a marker in the sharp screen-space overlay through zoom, pan, and reset", () => {
    render(
      <RadarViewport src="/marked.webp" alt="Marked radar" pointSelectionEnabled onPointSelect={vi.fn()}>
        <RadarMarker point={{ x: 0.6, y: 0.4 }} className="guess-marker" label="YOUR GUESS" ariaLabel="Selected point" />
      </RadarViewport>,
    );
    const surface = document.querySelector(".radar-gesture-surface") as HTMLDivElement;
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 100, top: 50, width: 400, height: 400, right: 500, bottom: 450, x: 100, y: 50, toJSON: () => ({}) }),
    });
    const image = screen.getByRole("img", { name: "Marked radar" });
    fireEvent.load(image);

    const marker = screen.getByRole("img", { name: "Selected point" }) as HTMLElement;
    const layer = document.querySelector(".radar-transform-layer") as HTMLElement;
    const overlay = document.querySelector(".radar-marker-overlay") as HTMLElement;
    expect(overlay.contains(marker)).toBe(true);
    expect(layer.contains(marker)).toBe(false);
    expect(layer.style.getPropertyValue("--radar-marker-inverse-scale")).toBe("");
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(240, 12);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(160, 12);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("2.0×");
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(280, 12);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(120, 12);

    for (let step = 0; step < 4; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    }
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("4.0×");
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(360, 12);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(40, 12);

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 260, clientY: 280 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 260, clientY: 280 });
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(320, 12);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(70, 12);
    expect(marker.querySelector(".radar-marker-label")?.textContent).toBe("YOUR GUESS");

    fireEvent.click(screen.getByRole("button", { name: "Reset radar view" }));
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("1.0×");
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(240, 12);
    expect(Number.parseFloat(marker.style.top)).toBeCloseTo(160, 12);
  });

  it("resets the viewport when the radar map or layer source changes", () => {
    const view = render(<RadarViewport src="/upper.webp" alt="Layer radar" />);
    fireEvent.load(screen.getByRole("img", { name: "Layer radar" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("1.5×");

    view.rerender(<RadarViewport src="/lower.webp" alt="Layer radar" />);
    expect(screen.getByLabelText("Current radar zoom").textContent).toBe("1.0×");
  });

  it("keeps read-only result radars zoomable without point selection", () => {
    render(<RadarViewport src="/result.webp" alt="Result radar" />);
    const image = screen.getByRole("img", { name: "Result radar" });
    fireEvent.load(image);

    expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector(".radar-viewport")?.classList.contains("is-readonly")).toBe(true);
  });
});
