import type { MobilePerformanceMetric } from "./mobile-performance-metrics";

export type MobileHealthKind = "API_LATENCY" | "CRASH" | "ERROR" | "SCREEN_LOAD" | "STARTUP";

export interface MobileHealthEvent {
  readonly context?: Record<string, unknown>;
  readonly kind: MobileHealthKind;
  readonly surface?: string;
  readonly valueMs?: number;
}

/** One flush's worth of events; the server refuses larger batches. */
export const MOBILE_HEALTH_BATCH_SIZE = 50;
/** Beyond this the oldest signals are dropped: a stuck device must not grow. */
export const MOBILE_HEALTH_QUEUE_CAP = 200;
export const MOBILE_HEALTH_FLUSH_INTERVAL_MS = 60_000;

export function toHealthEvents(
  metrics: readonly MobilePerformanceMetric[],
): readonly MobileHealthEvent[] {
  return metrics.map((metric) => ({
    kind: metric.metric === "startup" ? ("STARTUP" as const) : ("SCREEN_LOAD" as const),
    surface: metric.surface,
    valueMs: Math.round(metric.durationMs),
  }));
}

export interface MobileHealthReporterOptions {
  /** Resolves when the batch is accepted; a rejection keeps the queue intact. */
  readonly send: (events: readonly MobileHealthEvent[]) => Promise<void>;
}

export function createMobileHealthReporter({ send }: MobileHealthReporterOptions) {
  let queue: MobileHealthEvent[] = [];
  let flushing = false;

  function enqueue(...events: readonly MobileHealthEvent[]): void {
    queue.push(...events);

    if (queue.length > MOBILE_HEALTH_QUEUE_CAP) {
      queue = queue.slice(queue.length - MOBILE_HEALTH_QUEUE_CAP);
    }
  }

  async function flush(): Promise<boolean> {
    if (flushing || queue.length === 0) {
      return false;
    }

    const batch = queue.slice(0, MOBILE_HEALTH_BATCH_SIZE);
    flushing = true;

    try {
      await send(batch);
      queue = queue.slice(batch.length);
      return true;
    } catch {
      // Keep the batch: a failed flush is a retry, not a loss.
      return false;
    } finally {
      flushing = false;
    }
  }

  return {
    enqueue,
    enqueueMetrics: (metrics: readonly MobilePerformanceMetric[]) => {
      enqueue(...toHealthEvents(metrics));
    },
    flush,
    size: () => queue.length,
  };
}

export type MobileHealthReporter = ReturnType<typeof createMobileHealthReporter>;
