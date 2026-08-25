import type { CSSProperties, ReactNode } from "react";
import type { MapPoint } from "../../shared/types";
import { MAX_RADAR_ZOOM, MIN_RADAR_ZOOM, RADAR_ZOOM_STEP } from "./radarViewportMath";
import { useRadarViewport } from "./useRadarViewport";

export interface RadarViewportProps {
  src: string;
  alt: string;
  children?: ReactNode;
  className?: string;
  pointSelectionEnabled?: boolean;
  panZoomEnabled?: boolean;
  onPointSelect?: (point: MapPoint) => void;
}

export function RadarViewport({
  src,
  alt,
  children,
  className = "",
  pointSelectionEnabled = false,
  panZoomEnabled = true,
  onPointSelect,
}: RadarViewportProps) {
  const radar = useRadarViewport({ src, pointSelectionEnabled, panZoomEnabled, onPointSelect });
  const transformStyle = {
    transform: `translate3d(${radar.viewport.translateX}px, ${radar.viewport.translateY}px, 0) scale(${radar.viewport.scale})`,
    "--radar-marker-inverse-scale": 1 / radar.viewport.scale,
  } as CSSProperties;

  return (
    <div className={`radar-image-wrap radar-viewport ${pointSelectionEnabled ? "is-selectable" : "is-readonly"} ${radar.isDragging ? "is-dragging" : ""} ${className}`.trim()}>
      <div
        ref={radar.surfaceRef}
        className="radar-gesture-surface"
        onPointerDown={radar.handlePointerDown}
        onPointerMove={radar.handlePointerMove}
        onPointerUp={radar.handlePointerUp}
        onPointerCancel={radar.handlePointerCancel}
      >
        <div className="radar-transform-layer" style={transformStyle}>
          <img src={src} alt={alt} draggable={false} onLoad={() => radar.setImageReady(true)} />
          {children}
        </div>
      </div>
      {panZoomEnabled && (
        <div className="radar-zoom-controls" role="group" aria-label="Radar zoom controls">
          <button type="button" aria-label="Zoom out" disabled={!radar.imageReady || radar.viewport.scale <= MIN_RADAR_ZOOM} onClick={() => radar.zoomFromCenter(-RADAR_ZOOM_STEP)}>−</button>
          <output aria-label="Current radar zoom">{radar.viewport.scale.toFixed(1)}×</output>
          <button type="button" aria-label="Zoom in" disabled={!radar.imageReady || radar.viewport.scale >= MAX_RADAR_ZOOM} onClick={() => radar.zoomFromCenter(RADAR_ZOOM_STEP)}>+</button>
          <button type="button" className="radar-reset-button" aria-label="Reset radar view" disabled={!radar.imageReady || radar.viewport.scale === MIN_RADAR_ZOOM} onClick={radar.reset}>↺</button>
        </div>
      )}
    </div>
  );
}
