export type VideoViewport = { fit: "contain" | "cover"; zoom: number; panX: number; panY: number };
export type VideoGeometry = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
};
export const INITIAL_VIDEO_VIEWPORT: VideoViewport = { fit: "contain", zoom: 1, panX: 0, panY: 0 };
type Action =
  | { type: "reset" | "fitToContent" | "toggleFit" }
  | { type: "zoomBy"; delta: number; originX: number; originY: number; geometry: VideoGeometry }
  | { type: "panBy"; x: number; y: number; geometry: VideoGeometry };
export function reduceVideoViewport(state: VideoViewport, action: Action): VideoViewport {
  "worklet";
  if (action.type === "reset" || action.type === "fitToContent")
    return { ...INITIAL_VIDEO_VIEWPORT };
  if (action.type === "toggleFit")
    return { ...INITIAL_VIDEO_VIEWPORT, fit: state.fit === "contain" ? "cover" : "contain" };
  if (!("geometry" in action)) return state;
  const g = action.geometry;
  const zoom =
    action.type === "zoomBy" ? Math.min(4, Math.max(1, state.zoom + action.delta)) : state.zoom;
  const ratio = zoom / state.zoom;
  const x =
    action.type === "zoomBy"
      ? action.originX - (action.originX - state.panX) * ratio
      : state.panX + action.x;
  const y =
    action.type === "zoomBy"
      ? action.originY - (action.originY - state.panY) * ratio
      : state.panY + action.y;
  const fitScale = (state.fit === "contain" ? Math.min : Math.max)(
    g.width / Math.max(1, g.sourceWidth),
    g.height / Math.max(1, g.sourceHeight),
  );
  const boundX = Math.max(0, (g.sourceWidth * fitScale * zoom - g.width) / 2);
  const boundY = Math.max(0, (g.sourceHeight * fitScale * zoom - g.height) / 2);
  return {
    ...state,
    zoom,
    panX: Math.min(boundX, Math.max(-boundX, x)),
    panY: Math.min(boundY, Math.max(-boundY, y)),
  };
}
