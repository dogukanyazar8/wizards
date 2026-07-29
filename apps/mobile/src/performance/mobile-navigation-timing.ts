import { recordMobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * Tap to content, which is the thing the reader actually feels.
 *
 * A list's `onLoad` measures how long it took to render the children that were
 * already in the cache — it starts after the push, the mount and the fetch. The
 * span starts on the tap instead, and closes on the first meaningful content of
 * the route it opened.
 */
type MobileNavigationSpan = {
  readonly cacheHit: boolean;
  readonly startedAtMs: number;
};

const openSpans = new Map<string, MobileNavigationSpan>();

export function beginMobileNavigationSpan(
  route: string,
  startedAtMs: number = globalThis.performance.now(),
  /**
   * Whether the target's stream was already in the cache when the reader tapped.
   * A cached open and a network open are different budgets, and pooling them
   * hides both.
   */
  cacheHit = false,
): void {
  if (route.length === 0) {
    return;
  }

  // The newest tap wins: an abandoned span (the reader went back before content
  // arrived) must not be closed by a later, unrelated load.
  openSpans.set(route, { cacheHit, startedAtMs });
}

/**
 * Closes the span for `route`. Returns the elapsed time, or `null` when no tap is
 * waiting on this route — content that nobody navigated to is not a measurement,
 * and a list that re-renders must not report twice.
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
  recordMobilePerformanceSample({
    context: { cacheHit: span.cacheHit, route },
    durationMs,
    metric: "navigation",
    surface: "navigation",
  });

  return durationMs;
}

/** Sign-out and account switches leave nothing worth closing. */
export function resetMobileNavigationTimingForTests(): void {
  openSpans.clear();
}
