/**
 * The banner is drawn `cover` inside a fixed wide clip, so a stored focal point is
 * exactly CSS `object-position`: which point of the image lands at the centre of
 * the frame. expo-image renders this through `contentPosition`, and every banner
 * surface (edit preview, profile card, full page) maps the same stored offset the
 * same way, so a repositioned banner looks identical everywhere it appears.
 */

/** Centre of the frame: the default when a profile has never been repositioned. */
export const MOBILE_BANNER_FOCAL_CENTER = 0.5;

/**
 * Minimum finger travel that spans the whole 0..1 focal range. The edit preview
 * is only 88px tall, so mapping the drag straight onto the frame made a single
 * pixel worth more than 1% of the image and the banner jumped under the thumb.
 * Short axes borrow this longer virtual travel; axes already wider than it keep
 * their natural 1:1 feel.
 */
export const MOBILE_BANNER_DRAG_TRAVEL = 240;

/**
 * Focal point after dragging `translation` px along an axis whose on-screen
 * extent is `extent` px. Dragging down reveals the upper part of the image, so
 * the translation is subtracted.
 */
export function nextMobileBannerFocal(start: number, translation: number, extent: number): number {
  const travel = Math.max(extent || MOBILE_BANNER_DRAG_TRAVEL, MOBILE_BANNER_DRAG_TRAVEL);
  return clampMobileBannerFocal(start - translation / travel);
}

/** Keeps a raw drag value inside the frame; a non-finite value falls back to centre. */
export function clampMobileBannerFocal(value: number): number {
  if (!Number.isFinite(value)) {
    return MOBILE_BANNER_FOCAL_CENTER;
  }

  return Math.min(1, Math.max(0, value));
}

function resolveFocal(value: number | null | undefined): number {
  return typeof value === "number" ? clampMobileBannerFocal(value) : MOBILE_BANNER_FOCAL_CENTER;
}

/**
 * expo-image `contentPosition` for a stored focal point. Percentages, not pixels,
 * so the mapping is independent of the image's natural size and of the clip's
 * measured width — a 0.75 vertical focal always reveals the lower quarter.
 */
export function mobileBannerContentPosition(
  offsetX: number | null | undefined,
  offsetY: number | null | undefined,
): { left: string; top: string } {
  return {
    left: `${resolveFocal(offsetX) * 100}%`,
    top: `${resolveFocal(offsetY) * 100}%`,
  };
}
