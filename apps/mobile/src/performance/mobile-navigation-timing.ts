import { recordMobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * Tap to content, which is the thing the reader actually feels.
 *
 * A list's `onLoad` measures how long it took to render the children that were
 * already in the cache — it starts after the push, the mount and the fetch. The
 * span starts on the tap instead, and closes on the first meaningful content of
 * the route it opened.
 */
/**
 * Where the span came from.
 *
 * `tap` is the honest origin: the reader's finger. `navigation` is the fallback
 * for the many entry points that never touch a tap handler — a deep link, a push
 * intent, a profile card, the friends hub — and it starts a frame or two later,
 * so the two are recorded apart rather than pooled into one misleading number.
 */
export type MobileNavigationSpanOrigin = "navigation" | "tap";

type MobileNavigationSpan = {
  readonly cacheHit: boolean;
  readonly origin: MobileNavigationSpanOrigin;
  readonly startedAtMs: number;
};

/**
 * Past this, a span is a lost measurement rather than a slow one.
 *
 * A device run reported `resume` as exactly 60000ms — the sample clamp — from a
 * single sample: the span had stayed open until unrelated content rendered
 * minutes later. Recording that number moved a percentile nobody could act on,
 * which is worse than reporting nothing.
 */
export const MOBILE_NAVIGATION_SPAN_MAX_AGE_MS = 15_000;

const openSpans = new Map<string, MobileNavigationSpan>();
let abandonedSpanCount = 0;

export function beginMobileNavigationSpan(
  route: string,
  startedAtMs: number = globalThis.performance.now(),
  /**
   * Whether the target's stream was already in the cache when the reader tapped.
   * A cached open and a network open are different budgets, and pooling them
   * hides both.
   */
  cacheHit = false,
  origin: MobileNavigationSpanOrigin = "tap",
): void {
  if (route.length === 0) {
    return;
  }

  // The newest tap wins: an abandoned span (the reader went back before content
  // arrived) must not be closed by a later, unrelated load. The one it replaces
  // is counted rather than forgotten — ten resumes reporting one sample looked
  // like a quiet instrument instead of a lossy one.
  if (openSpans.has(route)) {
    abandonedSpanCount += 1;
  }

  openSpans.set(route, { cacheHit, origin, startedAtMs });
}

/**
 * Opens a span only when nothing is already waiting on this route.
 *
 * The navigator calls this for every chat it shows, which is what closed the
 * coverage hole: roughly half of a device run's opens were never measured
 * because they arrived from a deep link or a push intent rather than a tap. A
 * tap-started span is the better measurement, so it is never replaced.
 */
export function ensureMobileNavigationSpan(
  route: string,
  startedAtMs: number = globalThis.performance.now(),
  cacheHit = false,
): void {
  if (route.length === 0 || openSpans.has(route)) {
    return;
  }

  openSpans.set(route, { cacheHit, origin: "navigation", startedAtMs });
}

/**
 * Closes the span for `route`. Returns the elapsed time, or `null` when there is
 * nothing to report — no tap is waiting on this route, the clock ran backwards,
 * or the span is old enough that whatever closed it is not what it opened for.
 */
export function completeMobileNavigationSpan(
  route: string,
  completedAtMs: number = globalThis.performance.now(),
): number | null {
  const span = openSpans.get(route);
  if (!span) {
    return null;
  }

  openSpans.delete(route);
  const durationMs = completedAtMs - span.startedAtMs;
  if (durationMs < 0 || durationMs > MOBILE_NAVIGATION_SPAN_MAX_AGE_MS) {
    abandonedSpanCount += 1;
    return null;
  }

  recordMobilePerformanceSample({
    context: { cacheHit: span.cacheHit, origin: span.origin, route },
    durationMs,
    metric: "navigation",
    surface: "navigation",
  });

  return durationMs;
}

/**
 * What the device panel needs to tell a fast surface from an unmeasured one: a
 * low `n` next to a high `abandoned` means the instrument is losing spans, not
 * that the reader stopped opening chats.
 */
export function getMobileNavigationSpanDiagnostics(): {
  readonly abandoned: number;
  readonly open: number;
} {
  return { abandoned: abandonedSpanCount, open: openSpans.size };
}

/** Sign-out and account switches leave nothing worth closing. */
export function resetMobileNavigationTimingForTests(): void {
  openSpans.clear();
  abandonedSpanCount = 0;
}
