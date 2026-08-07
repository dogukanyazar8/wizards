/**
 * One framing contract for every video surface. A tile derives its box from the
 * source dimensions instead of a hard-coded literal, so the same publication is
 * cropped identically on every surface — and the frame a publisher sees in their
 * own preview is the frame everyone else receives.
 */

export type VideoSourceDimensions =
  | {
      readonly height: number;
      readonly width: number;
    }
  | null
  | undefined;

/**
 * `stage` covers every surface large enough to read: the stage, the active
 * speaker, a fullscreen viewer and any screen share. `thumbnail` is the small
 * corner preview where letterboxing would waste most of the box.
 */
export type VideoSizeClass = "stage" | "thumbnail";

export type VideoFit = "contain" | "cover";

export type VideoFacingMode = "environment" | "user" | null;

/** Widescreen fallback used whenever the source has not reported dimensions. */
export const DEFAULT_VIDEO_ASPECT = 16 / 9;

/** Portrait phone capture, the narrowest box a tile is allowed to take. */
export const MIN_VIDEO_ASPECT = 9 / 16;

/** Widescreen capture, the widest box a tile is allowed to take. */
export const MAX_VIDEO_ASPECT = 16 / 9;

/** Below this short edge a tile is a thumbnail and fills rather than letterboxes. */
export const VIDEO_THUMBNAIL_SHORT_EDGE = 160;

function clampAspect(value: number): number {
  return Math.min(MAX_VIDEO_ASPECT, Math.max(MIN_VIDEO_ASPECT, value));
}

export function resolveVideoAspect(dimensions: VideoSourceDimensions): number {
  if (!dimensions) {
    return DEFAULT_VIDEO_ASPECT;
  }

  const { height, width } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_VIDEO_ASPECT;
  }

  return clampAspect(width / height);
}

/**
 * An unknown short edge resolves to `stage`: showing the whole frame is the safe
 * default, cropping is not.
 */
export function resolveVideoSizeClass(shortEdge: number | null | undefined): VideoSizeClass {
  if (typeof shortEdge !== "number" || !Number.isFinite(shortEdge) || shortEdge <= 0) {
    return "stage";
  }

  return shortEdge < VIDEO_THUMBNAIL_SHORT_EDGE ? "thumbnail" : "stage";
}

export function resolveVideoFit({
  isScreenShare = false,
  sizeClass,
}: {
  isScreenShare?: boolean;
  sizeClass: VideoSizeClass;
}): VideoFit {
  // A cropped screen share loses the text it was shared for.
  if (isScreenShare) {
    return "contain";
  }

  return sizeClass === "thumbnail" ? "cover" : "contain";
}

/**
 * Mirroring is a self-view affordance only. A remote participant must never be
 * flipped, and a rear camera is not a mirror of anything the publisher sees.
 */
export function resolveMirror({
  facingMode,
  isLocal,
}: {
  facingMode: VideoFacingMode;
  isLocal: boolean;
}): boolean {
  return isLocal && facingMode === "user";
}
