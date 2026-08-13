import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  createMobilePerformanceSamplePersistence,
  discardPendingMobilePerformanceSamples,
  MOBILE_PERFORMANCE_PERSISTENCE_QUEUE_CAP,
  setActiveMobilePerformanceSamplePersistence,
} from "../src/performance/mobile-performance-sample-persistence";
import {
  observeMobilePerformanceSamples,
  recordMobilePerformanceSample,
  resetMobilePerformanceMetricsForTests,
  resetMobilePerformanceSampleObserversForTests,
  type MobilePerformanceSample,
} from "../src/performance/mobile-performance-metrics";

type Persisted = readonly MobilePerformanceSample[];

function createRecorder() {
  const batches: Persisted[] = [];
  let fail = false;

  return {
    batches,
    failNext() {
      fail = true;
    },
    async persist(samples: Persisted) {
      if (fail) {
        fail = false;
        throw new Error("database is locked");
      }
      batches.push(samples);
    },
  };
}

function sample(sampleId: string): MobilePerformanceSample {
  return Object.freeze({
    context: Object.freeze({ phase: "content-visible" }),
    durationMs: 10,
    metric: "startup" as const,
    sampleId,
    sampleOrdinal: 1,
    surface: "startup" as const,
  });
}

describe("performance sample persistence", () => {
  it("drops the oldest pending samples when instrumentation reaches its queue cap", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 60_000,
      persist: recorder.persist,
    });

    for (let index = 0; index < MOBILE_PERFORMANCE_PERSISTENCE_QUEUE_CAP + 25; index += 1) {
      persistence.capture(sample(`sample-${index}`));
    }

    assert.equal(persistence.pendingCount(), MOBILE_PERFORMANCE_PERSISTENCE_QUEUE_CAP);
    await persistence.flush();
    assert.equal(recorder.batches[0]?.[0]?.sampleId, "sample-25");
    assert.equal(
      recorder.batches[0]?.at(-1)?.sampleId,
      `sample-${MOBILE_PERFORMANCE_PERSISTENCE_QUEUE_CAP + 24}`,
    );
    persistence.dispose();
  });

  beforeEach(() => {
    resetMobilePerformanceMetricsForTests();
    resetMobilePerformanceSampleObserversForTests();
  });

  it("batches captures instead of writing once per measurement", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });

    persistence.capture(sample("a-1"));
    persistence.capture(sample("a-2"));
    await persistence.flush();

    assert.equal(recorder.batches.length, 1);
    assert.deepEqual(
      recorder.batches[0]?.map((entry) => entry.sampleId),
      ["a-1", "a-2"],
    );
  });

  it("flushes on its own once the debounce elapses", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 1,
      persist: recorder.persist,
    });

    persistence.capture(sample("a-1"));
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(recorder.batches.length, 1);
    persistence.dispose();
  });

  it("keeps a batch that failed to write so the next flush retries it", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });

    recorder.failNext();
    persistence.capture(sample("a-1"));
    await persistence.flush();
    assert.equal(recorder.batches.length, 0);

    await persistence.flush();
    assert.deepEqual(
      recorder.batches[0]?.map((entry) => entry.sampleId),
      ["a-1"],
    );
  });

  it("retries a failed debounced write without waiting for another measurement", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 1,
      persist: recorder.persist,
    });

    recorder.failNext();
    persistence.capture(sample("a-1"));
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.deepEqual(
      recorder.batches[0]?.map((entry) => entry.sampleId),
      ["a-1"],
    );
    persistence.dispose();
  });

  it("drops the pending batch when a run is reset", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 1,
      persist: recorder.persist,
    });

    persistence.capture(sample("a-1"));
    await persistence.discard();
    await new Promise((resolve) => setTimeout(resolve, 25));
    await persistence.flush();

    assert.equal(recorder.batches.length, 0);
    persistence.dispose();
  });

  it("exposes the active instance so the panel can reset it", () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });

    setActiveMobilePerformanceSamplePersistence(persistence);
    persistence.capture(sample("a-1"));
    assert.equal(persistence.pendingCount(), 1);

    discardPendingMobilePerformanceSamples();
    assert.equal(persistence.pendingCount(), 0);

    // Unregistering must make the helper a no-op rather than reaching a disposed
    // instance from a previous launch of the root.
    setActiveMobilePerformanceSamplePersistence(null);
    persistence.capture(sample("a-2"));
    discardPendingMobilePerformanceSamples();
    assert.equal(persistence.pendingCount(), 1);
    persistence.dispose();
  });

  it("waits for an in-flight write before reset clears its batch", async () => {
    let resolveWrite!: () => void;
    let signalWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: async () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
          signalWriteStarted();
        }),
    });

    persistence.capture(sample("a-1"));
    const flushing = persistence.flush();
    await writeStarted;
    const discarding = persistence.discard();

    resolveWrite();
    await discarding;
    await flushing;

    assert.equal(persistence.pendingCount(), 0);
    persistence.dispose();
  });

  it("does nothing when there is nothing pending", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });

    await persistence.flush();
    assert.equal(recorder.batches.length, 0);
  });

  it("captures samples the app recorded before it was wired up", async () => {
    const recorder = createRecorder();
    recordMobilePerformanceSample({
      context: { phase: "bundle-loaded" },
      durationMs: 42,
      metric: "startup",
      surface: "startup",
    });

    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });
    const stop = persistence.observe(observeMobilePerformanceSamples);

    recordMobilePerformanceSample({
      context: { route: "DirectMessage" },
      durationMs: 90,
      metric: "navigation",
      surface: "navigation",
    });
    await persistence.flush();
    stop();

    assert.deepEqual(
      recorder.batches[0]?.map((entry) => entry.context.phase ?? entry.context.route),
      ["bundle-loaded", "DirectMessage"],
    );
  });

  it("stops capturing once detached", async () => {
    const recorder = createRecorder();
    const persistence = createMobilePerformanceSamplePersistence({
      debounceMs: 5,
      persist: recorder.persist,
    });
    const stop = persistence.observe(observeMobilePerformanceSamples);
    stop();

    recordMobilePerformanceSample({
      durationMs: 1,
      metric: "navigation",
      surface: "navigation",
    });
    await persistence.flush();

    assert.equal(recorder.batches.length, 0);
  });
});
