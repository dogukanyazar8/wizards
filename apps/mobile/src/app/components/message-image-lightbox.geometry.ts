/**
 * Pure geometry for the full-screen image viewer, kept out of the component so
 * the pan bounds can be exercised without a gesture runtime.
 *
 * Every function here runs on the UI thread inside a gesture callback, hence
 * the worklet directives.
 */

export type MobileLightboxSize = { readonly height: number; readonly width: number };

/**
 * The size a `contain` fit draws `source` at inside `viewport`.
 *
 * `contain` scales in both directions, so a photo smaller than the screen is
 * enlarged to touch two edges exactly as a large one is shrunk to fit.
 */
export function getMobileLightboxContainedSize(
  source: MobileLightboxSize,
  viewport: MobileLightboxSize,
): MobileLightboxSize {
  "worklet";
  if (source.width <= 0 || source.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return viewport;
  }

  const fit = Math.min(viewport.width / source.width, viewport.height / source.height);
  return { height: source.height * fit, width: source.width * fit };
}

/**
 * How far a zoomed photo may travel on one axis before its edge would leave the
 * frame.
 *
 * `contentSize` is the letterboxed size the photo actually draws at, not the
 * frame it draws inside: a wide photo on a tall screen has empty bands above
 * and below it, and bounding by the frame would let those bands be dragged into
 * view. While the drawn size still fits the viewport there is nothing to pan to
 * and the bound is zero.
 */
export function getMobileLightboxPanBound(
  contentSize: number,
  viewportSize: number,
  scale: number,
): number {
  "worklet";
  return Math.max(0, (contentSize * scale - viewportSize) / 2);
}
