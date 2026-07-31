export const MOBILE_EVENT_LOOP_SAMPLE_CAP = 120;
const MOBILE_EVENT_LOOP_LAG_MAX_MS = 10_000;

export type MobileEventLoopLagSummary = {
  readonly count: number;
  readonly maxMs: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
};

type MobileEventLoopLagMonitorOptions = {
  readonly cancel?: (timerId: ReturnType<typeof setTimeout>) => void;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

function percentile(values: readonly number[], percentage: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentage / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))] ?? null;
}

/**
 * Low-overhead, diagnostics-only JS event-loop probe.
 *
 * It keeps one recursive timer while active and a bounded lag window. Stopping
 * cancels the pending timer synchronously, which is what background and unmount
 * cleanup rely on.
 */
export function createMobileEventLoopLagMonitor({
  cancel = (timerId) => globalThis.clearTimeout(timerId),
  intervalMs = 250,
  now = () => globalThis.performance.now(),
  schedule = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
}: MobileEventLoopLagMonitorOptions = {}) {
  const safeIntervalMs = Math.max(50, Math.min(intervalMs, 5_000));
  let expectedAtMs = 0;
  let running = false;
  let samples: number[] = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = () => {
    expectedAtMs = now() + safeIntervalMs;
    timerId = schedule(tick, safeIntervalMs);
  };

  const tick = () => {
    timerId = null;
    if (!running) return;

    const lagMs =
      Math.round(Math.min(Math.max(0, now() - expectedAtMs), MOBILE_EVENT_LOOP_LAG_MAX_MS) * 10) /
      10;
    samples.push(lagMs);
    if (samples.length > MOBILE_EVENT_LOOP_SAMPLE_CAP) {
      samples = samples.slice(samples.length - MOBILE_EVENT_LOOP_SAMPLE_CAP);
    }
    scheduleNext();
  };

  return {
    isRunning: () => running,
    reset() {
      samples = [];
    },
    snapshot(): MobileEventLoopLagSummary {
      return {
        count: samples.length,
        maxMs: samples.length === 0 ? null : Math.max(...samples),
        p50Ms: percentile(samples, 50),
        p95Ms: percentile(samples, 95),
      };
    },
    start() {
      if (running) return;
      running = true;
      scheduleNext();
    },
    stop() {
      running = false;
      if (timerId !== null) {
        cancel(timerId);
        timerId = null;
      }
    },
  };
}

export type MobileEventLoopLagMonitor = ReturnType<typeof createMobileEventLoopLagMonitor>;
