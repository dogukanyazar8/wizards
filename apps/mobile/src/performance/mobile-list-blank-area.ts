import { percentileMs } from "./mobile-performance-summary";

/**
 * Blank area: viewport the list is showing without a row in it.
 *
 * `drawDistance` is the knob everyone reaches for — 700px on the DM transcript —
 * and lowering it is free right up until the moment the reader out-scrolls the
 * renderer and watches empty space fill the screen. FlashList v2 dropped the
 * `onBlankArea` callback v1 had, so the number is derived here from the layouts
 * the list already knows: the gap above the first rendered row and below the last
 * one, whichever is worse.
 *
 * Nothing in this wave lowers `drawDistance`. This is what would have to read
 * clean first, and it is deliberately shipped one wave ahead of the change it
 * gates.
 */
export type MobileListLayoutSpan = {
  readonly height: number;
  readonly y: number;
};

export type MobileListBlankAreaSurface = "channel-messages" | "dm-messages";

export type MobileListBlankAreaInput = {
  readonly contentHeight: number;
  readonly firstVisible: MobileListLayoutSpan | null;
  readonly lastVisible: MobileListLayoutSpan | null;
  readonly scrollOffset: number;
  readonly viewportHeight: number;
};

/**
 * Returns the blank pixels, or `null` when the question does not apply.
 *
 * A conversation shorter than the screen is *supposed* to leave space, and a
 * scroll position past either end of the content is rubber-banding rather than a
 * renderer that fell behind. Recording those as blank area would bury the defect
 * this measures under legitimate emptiness.
 */
export function computeMobileListBlankArea(input: MobileListBlankAreaInput): number | null {
  const { contentHeight, firstVisible, lastVisible, scrollOffset, viewportHeight } = input;
  if (
    !firstVisible ||
    !lastVisible ||
    viewportHeight <= 0 ||
    contentHeight <= viewportHeight ||
    scrollOffset < 0 ||
    scrollOffset + viewportHeight > contentHeight
  ) {
    return null;
  }

  const blankAbove = Math.max(0, firstVisible.y - scrollOffset);
  const blankBelow = Math.max(
    0,
    scrollOffset + viewportHeight - (lastVisible.y + lastVisible.height),
  );

  return Math.round(Math.max(blankAbove, blankBelow));
}

export type MobileListBlankAreaStats = {
  readonly count: number;
  readonly maxPx: number | null;
  readonly p50Px: number | null;
  readonly p95Px: number | null;
  readonly surface: MobileListBlankAreaSurface;
};

/** A scroll produces one of these per frame budget; the tail is what matters. */
const MOBILE_LIST_BLANK_AREA_CAP = 240;

const samples = new Map<MobileListBlankAreaSurface, number[]>();

export function recordMobileListBlankArea(
  surface: MobileListBlankAreaSurface,
  blankAreaPx: number | null,
): void {
  if (blankAreaPx === null || !Number.isFinite(blankAreaPx) || blankAreaPx < 0) {
    return;
  }

  const bucket = samples.get(surface) ?? [];
  bucket.push(blankAreaPx);
  if (bucket.length > MOBILE_LIST_BLANK_AREA_CAP) {
    bucket.splice(0, bucket.length - MOBILE_LIST_BLANK_AREA_CAP);
  }
  samples.set(surface, bucket);
}

export function getMobileListBlankAreaSnapshot(): readonly MobileListBlankAreaStats[] {
  return [...samples.entries()].map(([surface, values]) => ({
    count: values.length,
    maxPx: values.length === 0 ? null : Math.max(...values),
    p50Px: percentileMs(values, 50),
    p95Px: percentileMs(values, 95),
    surface,
  }));
}

export function resetMobileListBlankAreaForTests(): void {
  samples.clear();
}
