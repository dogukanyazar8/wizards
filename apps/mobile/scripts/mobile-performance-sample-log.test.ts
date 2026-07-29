import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PERFORMANCE_SAMPLE_LOG_CAP,
  parseMobileStoredPerformanceSample,
  serializeMobileStoredPerformanceContext,
} from "../src/storage/mobile-message-store-policy";
import {
  createMobileMessageStore,
  type MobileMessageStoreBindValue,
  type MobileMessageStoreDatabase,
} from "../src/storage/mobile-message-store";

type SampleRow = {
  context: string;
  duration_ms: number;
  metric: string;
  recorded_at: number;
  sample_id: string;
  surface: string;
};

/**
 * In-memory stand-in for the `performance_samples` table.
 *
 * Only the statements the log issues are modelled; anything else throws so a
 * silent SQL drift shows up as a failing test rather than an empty panel.
 */
function createFakeSampleDatabase() {
  const rows = new Map<string, SampleRow>();
  let failNextWrite = false;

  const database: MobileMessageStoreDatabase = {
    async closeAsync() {
      // Nothing to release in the fake.
    },
    async execAsync() {
      // Table creation.
    },
    async getAllAsync<T>(source: string) {
      if (source.includes("FROM performance_samples")) {
        const ordered = [...rows.values()].sort((left, right) =>
          source.includes("DESC")
            ? right.recorded_at - left.recorded_at
            : left.recorded_at - right.recorded_at,
        );
        const limit = /LIMIT (\d+)/u.exec(source)?.[1];
        return (limit ? ordered.slice(0, Number(limit)) : ordered) as unknown as T[];
      }
      return [];
    },
    async getFirstAsync<T>() {
      return null as T | null;
    },
    async runAsync(source: string, params: MobileMessageStoreBindValue[]) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("database is locked");
      }

      if (source.startsWith("INSERT OR IGNORE INTO performance_samples")) {
        const [sampleId, metric, surface, durationMs, context, recordedAt] = params as [
          string,
          string,
          string,
          number,
          string,
          number,
        ];
        if (!rows.has(sampleId)) {
          rows.set(sampleId, {
            context,
            duration_ms: durationMs,
            metric,
            recorded_at: recordedAt,
            sample_id: sampleId,
            surface,
          });
        }
        return;
      }

      if (source.includes("DELETE FROM performance_samples WHERE sample_id NOT IN")) {
        const keep = params as string[];
        for (const [key, row] of rows) {
          if (!keep.includes(row.sample_id)) {
            rows.delete(key);
          }
        }
        return;
      }

      if (source.startsWith("DELETE FROM performance_samples")) {
        rows.clear();
        return;
      }

      throw new Error(`unexpected statement: ${source}`);
    },
  };

  return {
    database,
    failNextWrite() {
      failNextWrite = true;
    },
    rows,
  };
}

function createStore(fake: ReturnType<typeof createFakeSampleDatabase>) {
  return createMobileMessageStore({ openDatabase: async () => fake.database });
}

function sample(sampleId: string, overrides: Record<string, unknown> = {}) {
  return {
    context: { phase: "content-visible" },
    durationMs: 120,
    metric: "startup",
    sampleId,
    surface: "startup",
    ...overrides,
  };
}

describe("performance sample log", () => {
  it("survives a drain: what is appended is readable afterwards", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    await store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] });
    const stored = await store.readPerformanceSamples();

    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.sampleId, "a-1");
    assert.equal(stored[0]?.durationMs, 120);
    assert.deepEqual(stored[0]?.context, { phase: "content-visible" });
  });

  it("ignores a sample id it already has, so a re-flush cannot double count", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    await store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] });
    await store.appendPerformanceSamples({ now: 2_000, samples: [sample("a-1")] });

    assert.equal((await store.readPerformanceSamples()).length, 1);
  });

  it("keeps the newest samples once the cap is passed", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);
    const overflow = MOBILE_PERFORMANCE_SAMPLE_LOG_CAP + 5;

    await store.appendPerformanceSamples({
      now: 1_000,
      samples: Array.from({ length: overflow }, (_unused, index) =>
        sample(`a-${index}`, { recordedAt: index }),
      ),
    });

    const stored = await store.readPerformanceSamples();
    assert.equal(stored.length, MOBILE_PERFORMANCE_SAMPLE_LOG_CAP);
  });

  it("returns samples oldest first so percentiles read a whole session", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    await store.appendPerformanceSamples({ now: 3_000, samples: [sample("a-2")] });
    await store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] });

    const stored = await store.readPerformanceSamples();
    assert.deepEqual(
      stored.map((row) => row.sampleId),
      ["a-1", "a-2"],
    );
  });

  it("purges the log without touching the message pages", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    await store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] });
    await store.purgePerformanceSamples();

    assert.equal((await store.readPerformanceSamples()).length, 0);
  });

  it("reports a failed write so the persistence layer can retry it", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    fake.failNextWrite();
    await assert.rejects(store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] }));

    assert.equal((await store.readPerformanceSamples()).length, 0);
  });

  it("reads nothing while the store is sealed", async () => {
    const fake = createFakeSampleDatabase();
    const store = createStore(fake);

    await store.appendPerformanceSamples({ now: 1_000, samples: [sample("a-1")] });
    await store.close();

    assert.deepEqual(await store.readPerformanceSamples(), []);
  });
});

describe("stored performance sample parsing", () => {
  it("round-trips a context object", () => {
    const raw = serializeMobileStoredPerformanceContext({ cacheHit: true, route: "DirectMessage" });
    const parsed = parseMobileStoredPerformanceSample({
      context: raw,
      duration_ms: 42,
      metric: "navigation",
      recorded_at: 5,
      sample_id: "a-1",
      surface: "navigation",
    });

    assert.deepEqual(parsed, {
      context: { cacheHit: true, route: "DirectMessage" },
      durationMs: 42,
      metric: "navigation",
      sampleId: "a-1",
      surface: "navigation",
    });
  });

  it("drops a row it cannot trust rather than blanking the panel", () => {
    assert.equal(
      parseMobileStoredPerformanceSample({
        context: "{not json",
        duration_ms: 42,
        metric: "navigation",
        recorded_at: 5,
        sample_id: "a-1",
        surface: "navigation",
      }),
      null,
    );

    assert.equal(
      parseMobileStoredPerformanceSample({
        context: "{}",
        duration_ms: Number.NaN,
        metric: "navigation",
        recorded_at: 5,
        sample_id: "a-1",
        surface: "navigation",
      }),
      null,
    );

    assert.equal(parseMobileStoredPerformanceSample(null), null);
  });
});
