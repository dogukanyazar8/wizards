import {
  observeMobilePerformanceSamples,
  peekMobilePerformanceSamples,
  type MobilePerformanceSample,
} from "./mobile-performance-metrics";

/**
 * Matches the message cache's write debounce: a burst of measurements — a launch
 * marks five phases in under half a second — should cost one write, not five.
 */
export const MOBILE_PERFORMANCE_PERSISTENCE_DEBOUNCE_MS = 1_500;
const MOBILE_PERFORMANCE_PERSISTENCE_MAX_RETRY_DELAY_MS = 30_000;

export interface MobilePerformanceSamplePersistenceOptions {
  readonly debounceMs?: number;
  /** Resolves when the batch is durable; a rejection puts it back in the queue. */
  readonly persist: (samples: readonly MobilePerformanceSample[]) => Promise<void>;
}

/**
 * Copies measurements to the retained log as they happen.
 *
 * This is deliberately *not* the reporter's path. The reporter drains the
 * in-memory log — on a timer and on every background transition — because its
 * job is to hand measurements to the backend and never send them twice. The
 * panel's job is the opposite: keep them, across the ten launches a baseline run
 * takes. Both read the same source, and only this one keeps a copy.
 */
export function createMobilePerformanceSamplePersistence({
  debounceMs = MOBILE_PERFORMANCE_PERSISTENCE_DEBOUNCE_MS,
  persist,
}: MobilePerformanceSamplePersistenceOptions) {
  let pending: MobilePerformanceSample[] = [];
  const queuedIds = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  let disposed = false;
  let retryDelayMs = debounceMs;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleFlush(delayMs: number = debounceMs): void {
    if (disposed || timer || writing || pending.length === 0) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
  }

  function capture(sample: MobilePerformanceSample): void {
    if (disposed || queuedIds.has(sample.sampleId)) {
      return;
    }

    queuedIds.add(sample.sampleId);
    pending.push(sample);

    scheduleFlush();
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (writing || pending.length === 0) {
      return;
    }

    const batch = pending;
    pending = [];
    writing = true;

    try {
      await persist(batch);
      for (const sample of batch) {
        queuedIds.delete(sample.sampleId);
      }
      retryDelayMs = debounceMs;
    } catch {
      // A locked database is a retry, not a loss: the batch goes back in front
      // of anything captured while the write was in flight.
      pending = [...batch, ...pending];
      retryDelayMs = Math.min(
        Math.max(debounceMs, retryDelayMs) * 2,
        MOBILE_PERFORMANCE_PERSISTENCE_MAX_RETRY_DELAY_MS,
      );
    } finally {
      writing = false;
      scheduleFlush(retryDelayMs);
    }
  }

  return {
    capture,
    dispose() {
      disposed = true;
      clearTimer();
    },
    flush,
    /**
     * Starts copying, beginning with whatever was already recorded — the launch
     * phases are marked before any component can mount, so a subscription alone
     * would miss exactly the samples a baseline run is about.
     */
    observe(subscribe: typeof observeMobilePerformanceSamples = observeMobilePerformanceSamples) {
      peekMobilePerformanceSamples().forEach(capture);
      const unsubscribe = subscribe(capture);
      return () => {
        unsubscribe();
        clearTimer();
      };
    },
    pendingCount: () => pending.length,
  };
}

export type MobilePerformanceSamplePersistence = ReturnType<
  typeof createMobilePerformanceSamplePersistence
>;
