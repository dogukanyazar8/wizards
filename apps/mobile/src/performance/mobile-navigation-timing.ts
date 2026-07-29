import { recordMobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * Tap to content, which is the thing the reader actually feels.
 *
 * A list's `onLoad` measures how long it took to render the children that were
 * already in the cache — it starts after the push, the mount and the fetch. The
 * span starts on the tap instead, and closes on the first meaningful content of
 * the route it opened.
 */
const openSpans = new Map<string, number>();

export function beginMobileNavigationSpan(
  route: string,
  startedAtMs: number = globalThis.performance.now(),
): void {
  if (route.length === 0) {
    return;
  }

  // The newest tap wins: an abandoned span (the reader went back before content
  // arrived) must not be closed by a later, unrelated load.
  openSpans.set(route, startedAtMs);
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
  const startedAtMs = openSpans.get(route);
  if (startedAtMs === undefined) {
    return null;
  }

  openSpans.delete(route);
  const durationMs = completedAtMs - startedAtMs;
  recordMobilePerformanceSample({
    context: { route },
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
