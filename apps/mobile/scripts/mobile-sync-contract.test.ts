import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_SYNC_FOREGROUND_REFRESH_MS,
  MOBILE_SYNC_STALE_MS,
  createInitialMobileSyncSnapshot,
  formatMobileSyncAge,
  isMobileSyncRefreshing,
  isMobileSyncStale,
  markMobileSyncFailed,
  markMobileSyncStarted,
  markMobileSyncSucceeded,
  shouldRefreshOnForeground,
  summarizeMobileSyncHealth,
} from "../src/sync/mobile-sync-contract";

describe("mobile sync contract", () => {
  it("starts from a fail-closed stale snapshot", () => {
    const snapshot = createInitialMobileSyncSnapshot("bootstrap");

    assert.equal(snapshot.source, "bootstrap");
    assert.equal(snapshot.status, "idle");
    assert.equal(isMobileSyncStale(snapshot, 1_000), true);
    assert.equal(shouldRefreshOnForeground(snapshot, 1_000), true);
  });

  it("tracks successful sync freshness without leaking payload data", () => {
    const started = markMobileSyncStarted(createInitialMobileSyncSnapshot("dm"), 10_000);
    const succeeded = markMobileSyncSucceeded(started, 12_000);

    assert.equal(started.status, "syncing");
    assert.equal(succeeded.status, "ready");
    assert.equal(isMobileSyncRefreshing(started), true);
    assert.equal(isMobileSyncRefreshing(succeeded), false);
    assert.equal(succeeded.failureCount, 0);
    assert.equal(succeeded.lastCompletedAt, 12_000);
    assert.deepEqual(Object.keys(succeeded).sort(), [
      "failureCount",
      "lastCompletedAt",
      "lastFailedAt",
      "lastStartedAt",
      "source",
      "status",
    ]);
  });

  it("uses cooldowns for foreground refresh to avoid request storms", () => {
    const snapshot = markMobileSyncSucceeded(
      createInitialMobileSyncSnapshot("workspace"),
      100_000,
    );

    assert.equal(
      shouldRefreshOnForeground(
        snapshot,
        100_000 + MOBILE_SYNC_FOREGROUND_REFRESH_MS - 1,
      ),
      false,
    );
    assert.equal(
      shouldRefreshOnForeground(
        snapshot,
        100_000 + MOBILE_SYNC_FOREGROUND_REFRESH_MS,
      ),
      true,
    );
  });

  it("marks failures as refreshable only after the same foreground cooldown", () => {
    const failed = markMobileSyncFailed(
      markMobileSyncStarted(createInitialMobileSyncSnapshot("channel"), 5_000),
      6_000,
    );

    assert.equal(failed.status, "error");
    assert.equal(failed.failureCount, 1);
    assert.equal(shouldRefreshOnForeground(failed, 6_500), false);
    assert.equal(
      shouldRefreshOnForeground(failed, 6_000 + MOBILE_SYNC_FOREGROUND_REFRESH_MS),
      true,
    );
  });

  it("formats ages into bounded display buckets", () => {
    assert.deepEqual(formatMobileSyncAge(null, 100), { kind: "never", value: null });
    assert.deepEqual(formatMobileSyncAge(100_000, 104_000), { kind: "now", value: 0 });
    assert.deepEqual(formatMobileSyncAge(100_000, 145_000), {
      kind: "seconds",
      value: 45,
    });
    assert.deepEqual(formatMobileSyncAge(100_000, 281_000), {
      kind: "minutes",
      value: 3,
    });
  });

  it("keeps completed data fresh until the explicit stale budget", () => {
    const snapshot = markMobileSyncSucceeded(
      createInitialMobileSyncSnapshot("bootstrap"),
      10_000,
    );

    assert.equal(isMobileSyncStale(snapshot, 10_000 + MOBILE_SYNC_STALE_MS - 1), false);
    assert.equal(isMobileSyncStale(snapshot, 10_000 + MOBILE_SYNC_STALE_MS), true);
  });

  it("keeps successful background refreshes silent while exposing failures", () => {
    const bootstrap = markMobileSyncSucceeded(
      createInitialMobileSyncSnapshot("bootstrap"),
      10_000,
    );
    const refreshing = markMobileSyncStarted(bootstrap, 15_000);
    const failed = markMobileSyncFailed(
      markMobileSyncStarted(createInitialMobileSyncSnapshot("dm"), 20_000),
      21_000,
    );

    assert.deepEqual(summarizeMobileSyncHealth([refreshing]), {
      failedSources: [],
      failureCount: 0,
      isRefreshing: true,
      status: "healthy",
    });
    assert.deepEqual(summarizeMobileSyncHealth([refreshing, failed]), {
      failedSources: ["dm"],
      failureCount: 1,
      isRefreshing: true,
      status: "error",
    });
  });

  it("keeps first-load syncing out of user-facing recovery banners", () => {
    const firstLoad = markMobileSyncStarted(
      createInitialMobileSyncSnapshot("bootstrap"),
      5_000,
    );

    assert.deepEqual(summarizeMobileSyncHealth([firstLoad]), {
      failedSources: [],
      failureCount: 0,
      isRefreshing: true,
      status: "healthy",
    });
  });
});
