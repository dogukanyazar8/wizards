import { useWindowDimensions } from "react-native";

import { mobileLayoutMetrics } from "../design/tokens";

/**
 * Every banner in the app is the same image drawn `cover` inside a clip, so two
 * surfaces only agree on what they show when their clips share an aspect ratio.
 * They did not: the own-profile identity card is page-width by 212pt (~1.65:1),
 * the quick card drew 330×92 (~3.59:1) and the full page 148pt of full width
 * (~2.64:1). A banner positioned once on the profile screen was therefore cropped
 * three different ways, and the two peer surfaces disagreed with each other as
 * well as with the frame the owner set it in.
 *
 * The identity card is the reference — it is where the banner is placed and what
 * the owner checks the result against — so every other surface derives its height
 * from that ratio instead of carrying a literal of its own.
 *
 * Only surfaces showing a real photo take this height. A banner that is nothing
 * but flat colour has no framing to preserve, so it keeps its compact strip; the
 * edit preview already makes exactly that distinction.
 */

/** Horizontal gutters the profile hub lays the identity card out inside. */
export const MOBILE_BANNER_REFERENCE_GUTTER = 20;

/** The identity card's own height: the short side of the reference frame. */
export const MOBILE_BANNER_REFERENCE_HEIGHT = mobileLayoutMetrics.fixed.profileIdentityCardHeight;

/** Handoff frame width, used only until the window has reported a real one. */
const MOBILE_BANNER_FALLBACK_WINDOW_WIDTH = 390;

function resolveWidth(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Width ÷ height of the identity card on this screen. It moves with the window
 * because the card is fluid horizontally and fixed vertically, which is also why
 * a single hard-coded ratio would only be right on one device.
 */
export function getMobileBannerAspectRatio(windowWidth: number): number {
  const width = resolveWidth(windowWidth, MOBILE_BANNER_FALLBACK_WINDOW_WIDTH);
  const referenceWidth = Math.max(width - MOBILE_BANNER_REFERENCE_GUTTER * 2, 1);

  return referenceWidth / MOBILE_BANNER_REFERENCE_HEIGHT;
}

/** Height that frames `frameWidth` exactly as the identity card frames itself. */
export function getMobileBannerHeight(frameWidth: number, windowWidth: number): number {
  const fallback = resolveWidth(windowWidth, MOBILE_BANNER_FALLBACK_WINDOW_WIDTH);
  const width = resolveWidth(frameWidth, fallback);

  return Math.round(width / getMobileBannerAspectRatio(windowWidth));
}

/** `frameWidth: null` means the frame runs the full width of the window. */
export function useMobileBannerHeight(frameWidth: number | null): number {
  const windowWidth = useWindowDimensions().width;

  return getMobileBannerHeight(frameWidth ?? windowWidth, windowWidth);
}
