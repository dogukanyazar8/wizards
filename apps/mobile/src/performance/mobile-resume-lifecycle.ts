/**
 * Distinguishes an actual background return from boot. Some React Native
 * runtimes report an initial `active` transition, which must never count as a
 * warm resume sample.
 */
export const MOBILE_WARM_RESUME_MIN_BACKGROUND_MS = 250;

export function createMobileResumeLifecycle(
  input: {
    readonly minimumBackgroundDurationMs?: number;
  } = {},
) {
  const minimumBackgroundDurationMs =
    input.minimumBackgroundDurationMs ?? MOBILE_WARM_RESUME_MIN_BACKGROUND_MS;
  let backgroundedAtMs: number | null = null;

  return {
    observe(state: string, observedAtMs: number = globalThis.performance.now()): boolean {
      if (state === "background") {
        backgroundedAtMs ??= observedAtMs;
        return false;
      }
      if (state === "active" && backgroundedAtMs !== null) {
        const backgroundDurationMs = observedAtMs - backgroundedAtMs;
        backgroundedAtMs = null;
        return backgroundDurationMs >= minimumBackgroundDurationMs;
      }
      return false;
    },
  };
}
