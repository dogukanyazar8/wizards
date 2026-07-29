import type { MobilePerformanceMetric } from "./mobile-performance-metrics";
// Type-only: the resolver itself reads `react-native` and the Expo manifest, so
// the caller injects it and this module stays free of native imports.
import type { MobileTelemetryDimensionsResolver } from "./mobile-telemetry-dimensions";

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

/**
 * Turns samples into wire events.
 *
 * Every event carries the sample id — the reporter retries a failed batch, and the
 * backend has to be able to tell a retry from a second measurement — plus the
 * build, platform and network it came from, without which a pooled percentile
 * cannot be acted on.
 *
 * Resolving the dimensions is best effort: a native read that fails must not cost
 * the measurement.
 */
export function toHealthEvents(
  samples: readonly (MobilePerformanceMetric & {
    readonly context?: Readonly<Record<string, unknown>>;
    readonly sampleId?: string;
  })[],
  resolveDimensions:
    MobileTelemetryDimensionsResolver | (() => Readonly<Record<string, unknown>>) = () => ({}),
): readonly MobileHealthEvent[] {
  let dimensions: Readonly<Record<string, unknown>> = {};
  try {
    dimensions = resolveDimensions();
  } catch {
    dimensions = {};
  }

  return samples.map((sample) => ({
    context: {
      ...dimensions,
      ...(sample.context ?? {}),
      ...(sample.sampleId ? { sampleId: sample.sampleId } : {}),
    },
    kind: sample.metric === "startup" ? ("STARTUP" as const) : ("SCREEN_LOAD" as const),
    surface: sample.surface,
    valueMs: Math.round(sample.durationMs),
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
    enqueueMetrics: (
      samples: readonly MobilePerformanceMetric[],
      resolveDimensions?: MobileTelemetryDimensionsResolver,
    ) => {
      enqueue(
        ...(resolveDimensions
          ? toHealthEvents(samples, resolveDimensions)
          : toHealthEvents(samples)),
      );
    },
    flush,
    size: () => queue.length,
  };
}

export type MobileHealthReporter = ReturnType<typeof createMobileHealthReporter>;
