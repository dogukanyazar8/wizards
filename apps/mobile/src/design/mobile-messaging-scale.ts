import { useWindowDimensions } from "react-native";

/**
 * The messaging handoff is drawn on a 390pt frame ("1a" through "1h"). Every
 * metric in `mobileMessagingMetrics` is a measurement off that frame, so on a
 * 430pt phone the same numbers cover ~10% less of the screen than the mock does
 * and the whole list reads a size smaller — thinner rows, a presence dot that
 * looks like a speck, type that sits lighter than the design.
 *
 * This maps the frame onto the real screen instead: 1.0 at 390pt and up from
 * there, so proportions hold across devices.
 */
export const MOBILE_MESSAGING_BASELINE_WIDTH = 390;

/**
 * Wider than a phone (a tablet, a foldable open) is not "one big phone" — past
 * this the list would grow absurd, so the scale stops and the extra width
 * becomes margin, exactly as it does today.
 */
export const MOBILE_MESSAGING_MAX_SCALE = 1.15;

/**
 * Narrower screens are left alone: shrinking the 390pt frame on a small phone
 * takes the row below comfortable touch and reading sizes, and the design
 * already fits there.
 */
export const MOBILE_MESSAGING_MIN_SCALE = 1;

export function getMobileMessagingScale(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return MOBILE_MESSAGING_MIN_SCALE;
  }

  const raw = width / MOBILE_MESSAGING_BASELINE_WIDTH;
  return Math.min(Math.max(raw, MOBILE_MESSAGING_MIN_SCALE), MOBILE_MESSAGING_MAX_SCALE);
}

/**
 * Scales one measurement, rounded to a tenth of a point: enough precision for
 * hairlines and ring widths, without carrying float noise into every style.
 */
export function scaleMobileMessagingMetric(value: number, scale: number): number {
  return Math.round(value * scale * 10) / 10;
}

export function useMobileMessagingScale(): number {
  return getMobileMessagingScale(useWindowDimensions().width);
}
