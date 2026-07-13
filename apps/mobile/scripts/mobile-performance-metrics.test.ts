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
    assert.deepEqual(getMobilePerformanceMetricsSnapshot(), [
      { durationMs: 1820.13, metric: "startup", surface: "startup" },
      { durationMs: 72.35, metric: "list-load", surface: "channel-messages" },
    ]);
  });
});
