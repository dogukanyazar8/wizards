import { recordMobilePerformanceSample } from "./mobile-performance-metrics";

/**
 * The launch, in phases, measured from one origin.
 *
 * The old marker recorded a single number: module evaluation until the second
 * animation frame, from a component mounted *above* the font gate and the auth
 * provider. That frame shows nothing a reader wants — it is not time to content
 * and it is not interactive — so the number could not be held to a budget.
 *
 * `bundle-loaded` is as close to process start as JavaScript can honestly get
 * without a native module; everything after it is measured against the same
 * origin so the phases are comparable.
 */
/**
 * `cache-hydrated` and `navigator-ready` split the widest gap in the timeline.
 *
 * A device run put `root-first-frame` at 193ms and `content-visible` at 422ms:
 * more than half the launch sat between a shell frame and anything worth
 * reading, with nothing to say where. Restoring the query cache from disk and
 * mounting the navigation tree are the two things that happen in there, and both
 * are single, unambiguous moments.
 */
export type MobileStartupPhase =
  | "auth-resolved"
  | "bundle-loaded"
  | "cache-hydrated"
  | "content-visible"
  | "interactive"
  | "navigator-ready"
  | "root-first-frame";

const startupOriginMs = globalThis.performance.now();
const timeline = new Map<MobileStartupPhase, number>();

/**
 * Records a phase once. Returns the elapsed time, or `null` when the phase was
 * already marked — a re-render must not restate the launch.
 */
export function markMobileStartupPhase(
  phase: MobileStartupPhase,
  elapsedMs: number = globalThis.performance.now() - startupOriginMs,
): number | null {
  if (timeline.has(phase)) {
    return null;
  }

  timeline.set(phase, elapsedMs);
  recordMobilePerformanceSample({
    context: {
      phase,
      // Content that appears before the session resolves is a shell, not the
      // headline. The sample says which one it was rather than pretending.
      ...(phase === "content-visible" ? { authenticated: timeline.has("auth-resolved") } : {}),
    },
    durationMs: elapsedMs,
    metric: "startup",
    surface: "startup",
  });

  return elapsedMs;
}

export function getMobileStartupPhaseTimeline(): Readonly<
  Partial<Record<MobileStartupPhase, number>>
> {
  return Object.freeze(Object.fromEntries(timeline));
}

export function resetMobileStartupPhasesForTests(): void {
  timeline.clear();
}
