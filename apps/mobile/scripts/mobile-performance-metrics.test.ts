import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMobilePerformanceMetric,
  getMobilePerformanceMetricsSnapshot,
  recordMobilePerformanceMetric,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";

describe("mobile performance metrics", () => {
  it("keeps startup and FlashList timing evidence bounded and free of user data", () => {
    resetMobilePerformanceMetricsForTests();
    const metric = createMobilePerformanceMetric("channel-messages", 72.347);
    assert.deepEqual(metric, {
      durationMs: 72.35,
      metric: "list-load",
      surface: "channel-messages",
    });
    assert.equal(JSON.stringify(metric).includes("user"), false);
    assert.equal(createMobilePerformanceMetric("startup", Number.POSITIVE_INFINITY).durationMs, 0);

    recordMobilePerformanceMetric("startup", 1_820.127);
    recordMobilePerformanceMetric("channel-messages", 72.347);
    const snapshot = getMobilePerformanceMetricsSnapshot();
    assert.deepEqual(
      snapshot.map(({ durationMs, metric, surface }) => ({ durationMs, metric, surface })),
      [
        { durationMs: 1820.13, metric: "startup", surface: "startup" },
        { durationMs: 72.35, metric: "list-load", surface: "channel-messages" },
      ],
    );
    // Every sample carries its own id so a retried batch is deduped rather than
    // counted twice, and none of them carries user data.
    const sampleIds = snapshot.map((sample) => sample.sampleId);
    assert.equal(new Set(sampleIds).size, snapshot.length);
    assert.equal(JSON.stringify(snapshot).includes("user"), false);
  });
});
