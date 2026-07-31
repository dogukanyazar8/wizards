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

/**
 * The two moments inside a chat open worth telling apart.
 *
 * A cached open measured 653ms p95 against a 100ms budget with the stream
 * already in memory — no request, no server, no database. Everything in that
 * number is the client, and "the client" is three different costs: the
 * transition, mounting the screen, and the list's first render. One number
 * cannot say which, and guessing between them is how a week gets spent on the
 * wrong one.
 */
export type MobileNavigationStage = "mounted" | "navigated";

export const MOBILE_NAVIGATION_PHASES = [
  "tap",
  "navigation-dispatched",
  "screen-mounted",
  "conversation-selection-ready",
  "query-observer-bound",
  "query-data-ready",
  "message-model-built",
  "list-mounted",
  "content",
  "transition-completed",
] as const;

export type MobileNavigationPhase = (typeof MOBILE_NAVIGATION_PHASES)[number];

type MobileNavigationSpan = {
  readonly cacheHit: boolean;
  readonly navigationSampleId: string;
  /** Facts learned after the span opened; see `annotateMobileNavigationSpan`. */
  readonly notes: Record<string, unknown>;
  readonly origin: MobileNavigationSpanOrigin;
  readonly phases: Partial<Record<MobileNavigationPhase, number>>;
  readonly stages: Set<MobileNavigationStage>;
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
let navigationSampleCounter = 0;
const navigationProcessNonce = Date.now().toString(36);

function nextNavigationSampleId(): string {
  navigationSampleCounter += 1;
  return `nav-${navigationProcessNonce}-${navigationSampleCounter}`;
}

function createSpan(input: {
  readonly cacheHit: boolean;
  readonly origin: MobileNavigationSpanOrigin;
  readonly startedAtMs: number;
}): MobileNavigationSpan {
  return {
    cacheHit: input.cacheHit,
    navigationSampleId: nextNavigationSampleId(),
    notes: {},
    origin: input.origin,
    phases: input.origin === "tap" ? { tap: 0 } : {},
    stages: new Set(),
    startedAtMs: input.startedAtMs,
  };
}

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
): string | null {
  if (route.length === 0) {
    return null;
  }

  // The newest tap wins: an abandoned span (the reader went back before content
  // arrived) must not be closed by a later, unrelated load. The one it replaces
  // is counted rather than forgotten — ten resumes reporting one sample looked
  // like a quiet instrument instead of a lossy one.
  if (openSpans.has(route)) {
    abandonedSpanCount += 1;
  }

  const span = createSpan({ cacheHit, origin, startedAtMs });
  openSpans.set(route, span);
  return span.navigationSampleId;
}

/**
 * Records something about an open span that was not knowable when it started.
 *
 * The tap opens the span before the navigator has decided anything, so the
 * transition variant a push played only exists a frame later. First write wins:
 * a re-entry into a chat the reader is already in must not restate the open with
 * whatever the instrument has rotated to since.
 */
export function annotateMobileNavigationSpan(
  route: string,
  notes: Readonly<Record<string, unknown>>,
  navigationSampleId?: string | null,
): void {
  const span = openSpans.get(route);
  if (!span || (navigationSampleId && span.navigationSampleId !== navigationSampleId)) {
    return;
  }

  for (const [key, value] of Object.entries(notes)) {
    // `in` rather than `??=`: a recorded `null` is an answer ("nothing local
    // behind this open"), and `??=` would let the next annotation overwrite it.
    if (!(key in span.notes)) {
      span.notes[key] = value;
    }
  }
}

/** Returns the current route instance's opaque measurement id, never a product id. */
export function getMobileNavigationSampleId(route: string): string | null {
  return openSpans.get(route)?.navigationSampleId ?? null;
}

/** Stores one bounded milestone on the route instance without minting ten samples per open. */
export function markMobileNavigationPhase(
  route: string,
  phase: MobileNavigationPhase,
  atMs: number = globalThis.performance.now(),
  navigationSampleId?: string | null,
): number | null {
  const span = openSpans.get(route);
  if (
    !span ||
    (navigationSampleId && span.navigationSampleId !== navigationSampleId) ||
    span.phases[phase] !== undefined
  ) {
    return null;
  }

  const durationMs = atMs - span.startedAtMs;
  if (durationMs < 0 || durationMs > MOBILE_NAVIGATION_SPAN_MAX_AGE_MS) {
    return null;
  }

  span.phases[phase] = Math.round(durationMs * 100) / 100;
  return durationMs;
}

/**
 * Records how far into an open a milestone landed, without closing the span.
 *
 * Once per stage per span: a screen that re-renders is not opening again, and a
 * second mark would restate the same moment at a later time.
 */
export function markMobileNavigationStage(
  route: string,
  stage: MobileNavigationStage,
  atMs: number = globalThis.performance.now(),
  navigationSampleId?: string | null,
): number | null {
  const span = openSpans.get(route);
  if (
    !span ||
    (navigationSampleId && span.navigationSampleId !== navigationSampleId) ||
    span.stages.has(stage)
  ) {
    return null;
  }

  const durationMs = atMs - span.startedAtMs;
  if (durationMs < 0 || durationMs > MOBILE_NAVIGATION_SPAN_MAX_AGE_MS) {
    return null;
  }

  span.stages.add(stage);
  markMobileNavigationPhase(
    route,
    stage === "mounted" ? "screen-mounted" : "navigation-dispatched",
    atMs,
    span.navigationSampleId,
  );
  recordMobilePerformanceSample({
    context: {
      ...span.notes,
      cacheHit: span.cacheHit,
      navigationSampleId: span.navigationSampleId,
      origin: span.origin,
      route,
      stage,
    },
    durationMs,
    metric: "navigation",
    surface: "navigation",
  });

  return durationMs;
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
): string | null {
  if (route.length === 0) {
    return null;
  }

  const current = openSpans.get(route);
  if (current) {
    return current.navigationSampleId;
  }

  const span = createSpan({ cacheHit, origin: "navigation", startedAtMs });
  openSpans.set(route, span);
  return span.navigationSampleId;
}

/**
 * Closes the span for `route`. Returns the elapsed time, or `null` when there is
 * nothing to report — no tap is waiting on this route, the clock ran backwards,
 * or the span is old enough that whatever closed it is not what it opened for.
 */
export function completeMobileNavigationSpan(
  route: string,
  completedAtMs: number = globalThis.performance.now(),
  navigationSampleId?: string | null,
): number | null {
  const span = openSpans.get(route);
  if (!span || (navigationSampleId && span.navigationSampleId !== navigationSampleId)) {
    return null;
  }

  openSpans.delete(route);
  const durationMs = completedAtMs - span.startedAtMs;
  if (durationMs < 0 || durationMs > MOBILE_NAVIGATION_SPAN_MAX_AGE_MS) {
    abandonedSpanCount += 1;
    return null;
  }

  span.phases.content = Math.round(durationMs * 100) / 100;
  recordMobilePerformanceSample({
    context: {
      ...span.notes,
      cacheHit: span.cacheHit,
      navigationSampleId: span.navigationSampleId,
      origin: span.origin,
      phases: Object.freeze({ ...span.phases }),
      route,
    },
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
  navigationSampleCounter = 0;
}
