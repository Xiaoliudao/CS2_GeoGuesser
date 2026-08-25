import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MapPoint } from "../../shared/types";
import {
  clampRadarViewport,
  DEFAULT_RADAR_VIEWPORT,
  movedBeyondRadarDragThreshold,
  placeRadarPointAtScreenPoint,
  RADAR_ZOOM_STEP,
  screenPointToRadarPoint,
  type RadarScreenPoint,
  type RadarViewportSize,
  type RadarViewportState,
  zoomRadarAtPoint,
} from "./radarViewportMath";

interface PointerTrack {
  start: RadarScreenPoint;
  last: RadarScreenPoint;
  moved: boolean;
  blocksSelection: boolean;
}

interface PinchState {
  initialDistance: number;
  initialScale: number;
  radarPoint: MapPoint;
}

export interface UseRadarViewportOptions {
  src: string;
  pointSelectionEnabled: boolean;
  panZoomEnabled: boolean;
  onPointSelect?: (point: MapPoint) => void;
}

const midpoint = (first: RadarScreenPoint, second: RadarScreenPoint): RadarScreenPoint => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
});

const distance = (first: RadarScreenPoint, second: RadarScreenPoint) => (
  Math.hypot(second.x - first.x, second.y - first.y)
);

export function useRadarViewport({
  src,
  pointSelectionEnabled,
  panZoomEnabled,
  onPointSelect,
}: UseRadarViewportOptions) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerTrack>());
  const pinchRef = useRef<PinchState | null>(null);
  const viewportRef = useRef<RadarViewportState>(DEFAULT_RADAR_VIEWPORT);
  const [viewport, setViewportState] = useState<RadarViewportState>(DEFAULT_RADAR_VIEWPORT);
  const [viewportSize, setViewportSize] = useState<RadarViewportSize>({ width: 0, height: 0 });
  const [imageReady, setImageReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const setViewport = useCallback((next: RadarViewportState) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const getGeometry = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      rect,
      size: { width: rect.width, height: rect.height } satisfies RadarViewportSize,
    };
  }, []);

  const rememberViewportSize = useCallback((size: RadarViewportSize) => {
    setViewportSize((current) => (
      current.width === size.width && current.height === size.height ? current : size
    ));
  }, []);

  const measureViewport = useCallback(() => {
    const geometry = getGeometry();
    if (geometry) rememberViewportSize(geometry.size);
    return geometry;
  }, [getGeometry, rememberViewportSize]);

  const localPoint = useCallback((clientX: number, clientY: number) => {
    const geometry = getGeometry();
    if (!geometry) return null;
    return {
      point: { x: clientX - geometry.rect.left, y: clientY - geometry.rect.top },
      size: geometry.size,
    };
  }, [getGeometry]);

  const reset = useCallback(() => {
    pointersRef.current.clear();
    pinchRef.current = null;
    setIsDragging(false);
    setViewport(DEFAULT_RADAR_VIEWPORT);
  }, [setViewport]);

  useLayoutEffect(() => {
    setImageReady(false);
    setViewportSize({ width: 0, height: 0 });
    reset();
  }, [reset, src]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const clampAfterResize = () => {
      const geometry = measureViewport();
      if (!geometry) return;
      setViewport(clampRadarViewport(viewportRef.current, geometry.size));
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clampAfterResize);
    observer?.observe(surface);
    window.addEventListener("resize", clampAfterResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", clampAfterResize);
    };
  }, [measureViewport, setViewport]);

  const handleImageLoad = useCallback(() => {
    measureViewport();
    setImageReady(true);
  }, [measureViewport]);

  const zoomAt = useCallback((focalPoint: RadarScreenPoint, nextScale: number, size: RadarViewportSize) => {
    if (!panZoomEnabled || !imageReady) return;
    setViewport(zoomRadarAtPoint(viewportRef.current, size, focalPoint, nextScale));
  }, [imageReady, panZoomEnabled, setViewport]);

  const zoomFromCenter = useCallback((amount: number) => {
    const geometry = getGeometry();
    if (!geometry) return;
    zoomAt(
      { x: geometry.size.width / 2, y: geometry.size.height / 2 },
      viewportRef.current.scale + amount,
      geometry.size,
    );
  }, [getGeometry, zoomAt]);

  const beginPinch = useCallback((size: RadarViewportSize) => {
    const tracks = [...pointersRef.current.values()];
    if (tracks.length < 2) return;
    const first = tracks[0].last;
    const second = tracks[1].last;
    const center = midpoint(first, second);
    for (const track of tracks) track.blocksSelection = true;
    pinchRef.current = {
      initialDistance: Math.max(1, distance(first, second)),
      initialScale: viewportRef.current.scale,
      radarPoint: screenPointToRadarPoint(viewportRef.current, size, center),
    };
    setIsDragging(true);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imageReady || (!panZoomEnabled && !pointSelectionEnabled)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const local = localPoint(event.clientX, event.clientY);
    if (!local) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Optional in older browsers. */ }
    pointersRef.current.set(event.pointerId, {
      start: local.point,
      last: local.point,
      moved: false,
      blocksSelection: pointersRef.current.size > 0,
    });
    if (pointersRef.current.size >= 2 && panZoomEnabled) beginPinch(local.size);
  }, [beginPinch, imageReady, localPoint, panZoomEnabled, pointSelectionEnabled]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const track = pointersRef.current.get(event.pointerId);
    if (!track) return;
    const local = localPoint(event.clientX, event.clientY);
    if (!local) return;
    event.preventDefault();
    const previous = track.last;
    track.last = local.point;
    if (!track.moved && movedBeyondRadarDragThreshold(track.start, local.point)) track.moved = true;

    if (pointersRef.current.size >= 2 && panZoomEnabled) {
      const tracks = [...pointersRef.current.values()];
      const first = tracks[0].last;
      const second = tracks[1].last;
      const pinch = pinchRef.current;
      if (!pinch) {
        beginPinch(local.size);
        return;
      }
      const nextScale = pinch.initialScale * distance(first, second) / pinch.initialDistance;
      setViewport(placeRadarPointAtScreenPoint(pinch.radarPoint, midpoint(first, second), nextScale, local.size));
      return;
    }

    if (track.moved && panZoomEnabled) {
      setIsDragging(true);
      setViewport(clampRadarViewport({
        ...viewportRef.current,
        translateX: viewportRef.current.translateX + local.point.x - previous.x,
        translateY: viewportRef.current.translateY + local.point.y - previous.y,
      }, local.size));
    }
  }, [beginPinch, localPoint, panZoomEnabled, setViewport]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const track = pointersRef.current.get(event.pointerId);
    if (!track) return;
    const wasOnlyPointer = pointersRef.current.size === 1;
    const local = localPoint(event.clientX, event.clientY);
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Optional in older browsers. */ }

    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.values()][0];
      remaining.start = remaining.last;
      remaining.blocksSelection = true;
      remaining.moved = false;
    }
    if (pointersRef.current.size === 0) setIsDragging(false);

    if (
      !cancelled
      && wasOnlyPointer
      && !track.moved
      && !track.blocksSelection
      && pointSelectionEnabled
      && onPointSelect
      && local
    ) {
      onPointSelect(screenPointToRadarPoint(viewportRef.current, local.size, local.point));
    }
  }, [localPoint, onPointSelect, pointSelectionEnabled]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !panZoomEnabled || !imageReady) return;
    const handleWheel = (event: WheelEvent) => {
      const local = localPoint(event.clientX, event.clientY);
      if (!local) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? RADAR_ZOOM_STEP : -RADAR_ZOOM_STEP;
      zoomAt(local.point, viewportRef.current.scale + direction, local.size);
    };
    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, [imageReady, localPoint, panZoomEnabled, zoomAt]);

  return {
    surfaceRef,
    viewport,
    viewportSize,
    imageReady,
    isDragging,
    handleImageLoad,
    reset,
    zoomFromCenter,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finishPointer(event, false),
    handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => finishPointer(event, true),
  };
}
