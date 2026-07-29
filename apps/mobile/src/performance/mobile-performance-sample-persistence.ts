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
  let resetVersion = 0;
  let inFlightWrite: Promise<void> | null = null;
  let lastWriteError: unknown = null;

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
    const writeVersion = resetVersion;
    const write = Promise.resolve().then(() => persist(batch));
    inFlightWrite = write;

    try {
      await write;
      for (const sample of batch) {
        queuedIds.delete(sample.sampleId);
      }
      lastWriteError = null;
      retryDelayMs = debounceMs;
    } catch (error) {
      lastWriteError = error;
      // A locked database is a retry, not a loss: the batch goes back in front
      // of anything captured while the write was in flight.
      if (resetVersion === writeVersion) {
        pending = [...batch, ...pending];
        retryDelayMs = Math.min(
          Math.max(debounceMs, retryDelayMs) * 2,
          MOBILE_PERFORMANCE_PERSISTENCE_MAX_RETRY_DELAY_MS,
        );
      }
    } finally {
      if (inFlightWrite === write) {
        inFlightWrite = null;
      }
      writing = false;
      scheduleFlush(retryDelayMs);
    }
  }

  async function flushDurably(): Promise<void> {
    clearTimer();
    while (writing || pending.length > 0) {
      if (writing) {
        const activeWrite = inFlightWrite;
        if (activeWrite) {
          await activeWrite;
        }
        continue;
      }

      await flush();
      if (lastWriteError) {
        throw lastWriteError;
      }
    }
  }

  return {
    capture,
    /**
     * Throws away what has not been written yet.
     *
     * Only the panel's reset uses this: purging the table alone would let the
     * batch still sitting in the debounce window land a second later and put the
     * previous run back into a baseline that was supposed to start empty.
     */
    async discard() {
      resetVersion += 1;
      clearTimer();
      pending = [];
      queuedIds.clear();
      await inFlightWrite?.catch(() => undefined);
    },
    dispose() {
      disposed = true;
      resetVersion += 1;
      clearTimer();
      pending = [];
      queuedIds.clear();
    },
    flush,
    flushDurably,
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

/**
 * The one instance the app root wired up.
 *
 * Registered rather than constructed here because the writer needs the encrypted
 * store, and this module stays free of native imports so it can be tested on
 * node. The panel is the only reader: it has to be able to discard the pending
 * batch when a run is reset.
 */
let activePersistence: MobilePerformanceSamplePersistence | null = null;

export function setActiveMobilePerformanceSamplePersistence(
  persistence: MobilePerformanceSamplePersistence | null,
): void {
  activePersistence = persistence;
}

export function discardPendingMobilePerformanceSamples(): Promise<void> {
  return activePersistence?.discard() ?? Promise.resolve();
}

/**
 * A benchmark checkpoint must not claim a completed launch before its retained
 * samples have reached SQLCipher: the host will force-stop immediately after it
 * sees the readiness marker.
 */
export function flushMobilePerformanceSamplesDurably(): Promise<void> {
  return activePersistence?.flushDurably() ?? Promise.resolve();
}
