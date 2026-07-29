import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobilePerformanceBenchmarkReport,
  serializeMobilePerformanceBenchmarkReport,
} from "../src/performance/mobile-performance-benchmark-report";

describe("createMobilePerformanceBenchmarkReport", () => {
  it("exports the six budget metrics, prefetch, store, and runtime dimensions", () => {
    const report = createMobilePerformanceBenchmarkReport({
      apiOrigin: "https://wizardsweb-uat.up.railway.app",
      dimensions: {
        appVersion: "0.8.15",
        buildId: "3a070425",
        deviceTier: "mid",
        environment: "uat",
        networkClass: "wifi",
        osName: "android",
        osVersion: "16",
      },
      prefetch: { hitRate: 0.5, hits: 1, warmed: 2 },
      rows: [
        { count: 10, metric: "startup", p50Ms: 210, p95Ms: 390, p99Ms: 410 },
        { count: 15, metric: "chat-open-cached", p50Ms: 50, p95Ms: 60, p99Ms: 61 },
      ],
      storage: { cipherVersion: "4.5.5 community", rowCount: 26, status: "open" },
    });

    assert.deepEqual(report, {
      metrics: [
        { metric: "startup", n: 10, p50Ms: 210, p95Ms: 390, p99Ms: 410 },
        { metric: "resume", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "chat-open-cached", n: 15, p50Ms: 50, p95Ms: 60, p99Ms: 61 },
        { metric: "chat-open-network", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "send-echo", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "send-ack", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
      ],
      prefetch: { hitRate: 0.5, hits: 1, warmed: 2 },
      runtime: {
        apiOrigin: "https://wizardsweb-uat.up.railway.app",
        appVersion: "0.8.15",
        buildId: "3a070425",
        deviceTier: "mid",
        environment: "uat",
        networkClass: "wifi",
        osName: "android",
        osVersion: "16",
      },
      schemaVersion: 1,
      store: { cipherVersion: "4.5.5 community", rowCount: 26, status: "open" },
    });
  });

  it("uses a fixed allow-list so raw benchmark context cannot leave the device panel", () => {
    const report = createMobilePerformanceBenchmarkReport({
      apiOrigin: "https://wizardsweb-uat.up.railway.app",
      dimensions: {
        appVersion: "0.8.15",
        buildId: "3a070425",
        deviceTier: "mid",
        environment: "uat",
        installId: "do-not-export",
        networkClass: "wifi",
        osName: "android",
        osVersion: "16",
      } as never,
      prefetch: { hitRate: 1, hits: 1, warmed: 1, conversationId: "do-not-export" } as never,
      rows: [
        {
          count: 1,
          context: { body: "do-not-export" },
          metric: "startup",
          p50Ms: 100,
          p95Ms: 100,
          p99Ms: 100,
        } as never,
      ],
      storage: {
        cipherVersion: "4.5.5 community",
        rowCount: 1,
        secret: "do-not-export",
        status: "open",
      } as never,
    });

    const serialized = serializeMobilePerformanceBenchmarkReport(report);
    assert.doesNotMatch(serialized, /do-not-export/u);
    assert.doesNotMatch(serialized, /context/u);
    assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
      "metrics",
      "prefetch",
      "runtime",
      "schemaVersion",
      "store",
    ]);
  });
});
