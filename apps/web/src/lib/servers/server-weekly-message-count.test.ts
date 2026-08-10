import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS,
  getServerWeeklyMessageCount,
  isServerWeeklyMessageCountFresh,
  parseServerWeeklyMessageCount,
  serializeServerWeeklyMessageCount,
  serverWeeklyMessageCountCacheKey,
  serverWeeklyMessageCountLockKey,
} from "@/lib/servers/server-weekly-message-count";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function buildDatabase(count = 42) {
  const calls: string[] = [];

  return {
    calls,
    database: {
      message: {
        count: async () => {
          calls.push("message.count");
          return count;
        },
      },
    } as never,
  };
}

function buildCache(options: { entries?: Map<string, string>; lockTaken?: boolean }) {
  const entries = options.entries ?? new Map<string, string>();
  const locks: string[] = [];

  return {
    cache: {
      acquireLock: async (key: string) => {
        locks.push(key);
        return options.lockTaken !== true;
      },
      read: async (key: string) => entries.get(key) ?? null,
      write: async (key: string, payload: string) => {
        entries.set(key, payload);
      },
    },
    entries,
    locks,
  };
}

describe("serverWeeklyMessageCount cache entry", () => {
  it("round-trips the count and the moment it was computed", () => {
    const entry = { computedAtMs: NOW.getTime(), count: 7 };

    assert.deepEqual(
      parseServerWeeklyMessageCount(serializeServerWeeklyMessageCount(entry)),
      entry,
    );
  });

  it("rejects a malformed or negative payload", () => {
    assert.equal(parseServerWeeklyMessageCount(null), null);
    assert.equal(parseServerWeeklyMessageCount("nope"), null);
    assert.equal(parseServerWeeklyMessageCount("-1:1"), null);
    assert.equal(parseServerWeeklyMessageCount("5"), null);
  });

  it("treats an entry older than the refresh window as stale", () => {
    const ttlMs = SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS * 1_000;

    assert.equal(
      isServerWeeklyMessageCountFresh(
        { computedAtMs: NOW.getTime() - 1_000, count: 1 },
        NOW.getTime(),
      ),
      true,
    );
    assert.equal(
      isServerWeeklyMessageCountFresh(
        { computedAtMs: NOW.getTime() - ttlMs, count: 1 },
        NOW.getTime(),
      ),
      false,
    );
  });
});

describe("getServerWeeklyMessageCount", () => {
  it("serves a fresh cached number without touching the database", async () => {
    const { calls, database } = buildDatabase();
    const { cache } = buildCache({
      entries: new Map([
        [
          serverWeeklyMessageCountCacheKey("s1"),
          serializeServerWeeklyMessageCount({ computedAtMs: NOW.getTime() - 1_000, count: 9 }),
        ],
      ]),
    });

    assert.equal(await getServerWeeklyMessageCount(database, "s1", cache, NOW), 9);
    assert.deepEqual(calls, []);
  });

  it("computes and caches on a cold key", async () => {
    const { calls, database } = buildDatabase(42);
    const { cache, entries, locks } = buildCache({});

    assert.equal(await getServerWeeklyMessageCount(database, "s1", cache, NOW), 42);
    assert.deepEqual(calls, ["message.count"]);
    assert.deepEqual(locks, [serverWeeklyMessageCountLockKey("s1")]);
    assert.equal(
      parseServerWeeklyMessageCount(entries.get(serverWeeklyMessageCountCacheKey("s1")) ?? null)
        ?.count,
      42,
    );
  });

  // A0.5: without the lock every concurrent open on a crowded server ran the
  // same slow aggregate the moment the key expired.
  it("serves the stale number to everyone who loses the single-flight lock", async () => {
    const { calls, database } = buildDatabase(42);
    const staleMs = NOW.getTime() - SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS * 1_000 - 1_000;
    const { cache } = buildCache({
      entries: new Map([
        [
          serverWeeklyMessageCountCacheKey("s1"),
          serializeServerWeeklyMessageCount({ computedAtMs: staleMs, count: 9 }),
        ],
      ]),
      lockTaken: true,
    });

    assert.equal(await getServerWeeklyMessageCount(database, "s1", cache, NOW), 9);
    assert.deepEqual(calls, []);
  });

  it("reports no number rather than queueing when the cache is cold and the lock is held", async () => {
    const { calls, database } = buildDatabase();
    const { cache } = buildCache({ lockTaken: true });

    assert.equal(await getServerWeeklyMessageCount(database, "s1", cache, NOW), null);
    assert.deepEqual(calls, []);
  });

  it("keeps the stale number when the recount itself fails", async () => {
    const staleMs = NOW.getTime() - SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS * 1_000 - 1_000;
    const { cache } = buildCache({
      entries: new Map([
        [
          serverWeeklyMessageCountCacheKey("s1"),
          serializeServerWeeklyMessageCount({ computedAtMs: staleMs, count: 9 }),
        ],
      ]),
    });
    const database = {
      message: {
        count: async () => {
          throw new Error("statement timeout");
        },
      },
    } as never;

    assert.equal(await getServerWeeklyMessageCount(database, "s1", cache, NOW), 9);
  });
});
