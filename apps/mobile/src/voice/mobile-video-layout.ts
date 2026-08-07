/**
 * One framing contract for every mobile video surface, matching the web
 * contract in `apps/web/src/lib/voice/video-layout.ts`. RN WebRTC applies the
 * device rotation, so a phone publishes a portrait frame; deriving the tile box
 * from the source keeps that frame identical on the grid, the stage and the
 * publisher's own preview.
 */

export type MobileVideoSourceDimensions =
  | {
      readonly height: number;
      readonly width: number;
    }
  | null
  | undefined;

/**
 * `stage` covers every surface large enough to read: the stage, the active
 * speaker, a fullscreen viewer and any screen share. `thumbnail` is the small
 * tile where letterboxing would waste most of the box.
 */
export type MobileVideoSizeClass = "stage" | "thumbnail";

export type MobileVideoFit = "contain" | "cover";

export type MobileVideoFacingMode = "environment" | "user" | null;

/** Widescreen fallback used whenever the source has not reported dimensions. */
export const DEFAULT_MOBILE_VIDEO_ASPECT = 16 / 9;

/** Portrait phone capture, the narrowest box a tile is allowed to take. */
export const MIN_MOBILE_VIDEO_ASPECT = 9 / 16;

/** Widescreen capture, the widest box a tile is allowed to take. */
export const MAX_MOBILE_VIDEO_ASPECT = 16 / 9;

/** Below this short edge (pt) a tile is a thumbnail and fills rather than letterboxes. */
export const MOBILE_VIDEO_THUMBNAIL_SHORT_EDGE = 160;

function clampAspect(value: number): number {
  return Math.min(MAX_MOBILE_VIDEO_ASPECT, Math.max(MIN_MOBILE_VIDEO_ASPECT, value));
}

export function resolveVideoAspect(dimensions: MobileVideoSourceDimensions): number {
  if (!dimensions) {
    return DEFAULT_MOBILE_VIDEO_ASPECT;
  }

  const { height, width } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_MOBILE_VIDEO_ASPECT;
  }

  return clampAspect(width / height);
}

/**
 * An unknown short edge resolves to `stage`: showing the whole frame is the safe
 * default, cropping is not.
 */
export function resolveVideoSizeClass(shortEdge: number | null | undefined): MobileVideoSizeClass {
  if (typeof shortEdge !== "number" || !Number.isFinite(shortEdge) || shortEdge <= 0) {
    return "stage";
  }

  return shortEdge < MOBILE_VIDEO_THUMBNAIL_SHORT_EDGE ? "thumbnail" : "stage";
}

export function resolveVideoFit({
  isScreenShare = false,
  sizeClass,
}: {
  isScreenShare?: boolean;
  sizeClass: MobileVideoSizeClass;
}): MobileVideoFit {
  // A cropped screen share loses the text it was shared for.
  if (isScreenShare) {
    return "contain";
  }

  return sizeClass === "thumbnail" ? "cover" : "contain";
}

/**
 * Mirroring is a self-view affordance only. A remote participant must never be
 * flipped, and the rear camera is not a mirror of anything the publisher sees.
 */
export function resolveMirror({
  facingMode,
  isLocal,
}: {
  facingMode: MobileVideoFacingMode;
  isLocal: boolean;
}): boolean {
  return isLocal && facingMode === "user";
}
