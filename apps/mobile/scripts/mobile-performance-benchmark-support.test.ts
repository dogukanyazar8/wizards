import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateMobilePerformanceBenchmarkReport,
  parseMobilePerformanceBenchmarkConfig,
  parseUiAutomatorBenchmarkReport,
} from "./mobile-performance-benchmark-support";

const networkChannelNames = Array.from(
  { length: 8 },
  (_, index) => `UAT Perf Network ${index + 1}`,
);

function reportXml(
  input: {
    counts?: Partial<Record<string, number>>;
    resourceId?: string;
    runtime?: Partial<{
      apiOrigin: string;
      buildId: string;
      environment: string;
      networkClass: string;
    }>;
  } = {},
) {
  const counts = {
    "chat-open-cached": 15,
    "chat-open-network": 8,
    resume: 10,
    "send-ack": 20,
    "send-echo": 20,
    startup: 10,
    ...input.counts,
  };
  const report = {
    metrics: Object.entries(counts).map(([metric, n]) => ({
      metric,
      n,
      p50Ms: 100,
      p95Ms: 150,
      p99Ms: 200,
    })),
    prefetch: { hitRate: 0.5, hits: 1, warmed: 2 },
    runtime: {
      apiOrigin: input.runtime?.apiOrigin ?? "https://wizardsweb-uat.up.railway.app",
      appVersion: "0.8.15",
      buildId: input.runtime?.buildId ?? "0123456789abcdef0123456789abcdef01234567",
      deviceTier: "mid",
      environment: input.runtime?.environment ?? "uat",
      networkClass: input.runtime?.networkClass ?? "wifi",
      osName: "android",
      osVersion: "16",
    },
    schemaVersion: 1,
    store: { cipherVersion: "4.5.5 community", rowCount: 63, status: "open" },
  };
  const encoded = JSON.stringify(report).replaceAll('"', "&quot;");
  return `<hierarchy><node content-desc="${encoded}" resource-id="${input.resourceId ?? "performance-benchmark-report"}" /></hierarchy>`;
}

describe("mobile performance benchmark support", () => {
  it("accepts exactly eight unique channel names and the benchmark workspace anchor", () => {
    const config = parseMobilePerformanceBenchmarkConfig({
      cacheDmConversationId: "cache-dm",
      cacheDmTitle: "UAT Perf Cache",
      credentials: { email: "perf-bot@example.test", password: "not-exported" },
      networkChannelNames,
      version: 1,
      workspace: { anchorChannelId: "anchor-channel", serverId: "perf-server" },
    });

    assert.equal(config.networkChannelNames.length, 8);
    assert.equal(config.cacheDmConversationId, "cache-dm");
    assert.equal(config.workspace.serverId, "perf-server");
  });

  it("rejects duplicate channel names so a cache hit cannot masquerade as eight first opens", () => {
    assert.throws(
      () =>
        parseMobilePerformanceBenchmarkConfig({
          cacheDmConversationId: "cache-dm",
          cacheDmTitle: "UAT Perf Cache",
          networkChannelNames: [...networkChannelNames.slice(0, 7), networkChannelNames[0]],
          version: 1,
          workspace: { anchorChannelId: "anchor-channel", serverId: "perf-server" },
        }),
      /eight unique/i,
    );
  });

  it("requires fixture credentials so an existing device session cannot select another user", () => {
    assert.throws(
      () =>
        parseMobilePerformanceBenchmarkConfig({
          cacheDmConversationId: "cache-dm",
          cacheDmTitle: "UAT Perf Cache",
          networkChannelNames,
          version: 1,
          workspace: { anchorChannelId: "anchor-channel", serverId: "perf-server" },
        }),
      /credentials must be an object/i,
    );
  });

  it("reads the allow-listed report from UIAutomator XML and checks the requested counts", () => {
    const report = parseUiAutomatorBenchmarkReport(reportXml());
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report, {
      expectedBuildId: "0123456789abcdef0123456789abcdef01234567",
    });

    assert.equal(report.runtime.environment, "uat");
    assert.deepEqual(evaluation, { status: "PASS", violations: [] });
  });

  it("reads the report when Android namespaces the React Native test id", () => {
    const report = parseUiAutomatorBenchmarkReport(
      reportXml({ resourceId: "team.whispr.mobile:id/performance-benchmark-report" }),
    );

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.metrics.find((metric) => metric.metric === "startup")?.n, 10);
  });

  it("fails when the release APK build identity differs from the expected source commit", () => {
    const report = parseUiAutomatorBenchmarkReport(reportXml());
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report, {
      expectedBuildId: "456789abcdef0123456789abcdef0123456789ab",
    });

    assert.equal(evaluation.status, "FAIL");
    assert.deepEqual(evaluation.violations, [
      "Expected release build 456789abcdef0123456789abcdef0123456789ab; received 0123456789abcdef0123456789abcdef01234567.",
    ]);
  });

  it("fails when the benchmark runner does not supply an expected release build identity", () => {
    const report = parseUiAutomatorBenchmarkReport(reportXml());
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report);

    assert.equal(evaluation.status, "FAIL");
    assert.deepEqual(evaluation.violations, ["Expected full source Git SHA was not supplied."]);
  });

  it("fails evidence that is short of any requested iteration count", () => {
    const report = parseUiAutomatorBenchmarkReport(reportXml({ counts: { "send-ack": 19 } }));
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report);

    assert.equal(evaluation.status, "FAIL");
    assert.match(evaluation.violations.join("\n"), /send-ack.*20.*19/i);
  });

  it("fails evidence with extra samples instead of treating stale history as a pass", () => {
    const report = parseUiAutomatorBenchmarkReport(reportXml({ counts: { "send-ack": 21 } }));
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report);

    assert.equal(evaluation.status, "FAIL");
    assert.match(evaluation.violations.join("\n"), /send-ack.*exactly.*20.*21/i);
  });

  it("fails a report whose runtime network class is not Wi-Fi", () => {
    const report = parseUiAutomatorBenchmarkReport(
      reportXml({ runtime: { networkClass: "cellular" } }),
    );
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report);

    assert.equal(evaluation.status, "FAIL");
    assert.match(evaluation.violations.join("\n"), /Wi-Fi.*cellular/i);
  });

  it("fails evidence captured from a non-canonical UAT API origin", () => {
    const report = parseUiAutomatorBenchmarkReport(
      reportXml({ runtime: { apiOrigin: "https://wrong-uat.example.test" } }),
    );
    const evaluation = evaluateMobilePerformanceBenchmarkReport(report, {
      expectedBuildId: "0123456789abcdef0123456789abcdef01234567",
    });

    assert.equal(evaluation.status, "FAIL");
    assert.match(evaluation.violations.join("\n"), /canonical UAT API origin/i);
  });

  it("rejects malformed nested evidence before evaluation", () => {
    const malformed = JSON.stringify({
      metrics: [
        { metric: "startup", n: 1, p50Ms: 100, p95Ms: 90, p99Ms: 110 },
        { metric: "resume", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "chat-open-cached", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "chat-open-network", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "send-echo", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
        { metric: "send-ack", n: 0, p50Ms: null, p95Ms: null, p99Ms: null },
      ],
      prefetch: { hitRate: "1", hits: 1, warmed: 1 },
      runtime: {
        appVersion: "0.8.15",
        buildId: "3a070425",
        deviceTier: "mid",
        environment: "uat",
        networkClass: "wifi",
        osName: "android",
        osVersion: "16",
      },
      schemaVersion: 1,
      store: { cipherVersion: {}, rowCount: 1, status: "open" },
    }).replaceAll('"', "&quot;");

    assert.throws(
      () =>
        parseUiAutomatorBenchmarkReport(
          `<hierarchy><node content-desc="${malformed}" resource-id="performance-benchmark-report" /></hierarchy>`,
        ),
      /invalid metric rows|missing benchmark sections|invalid benchmark sections/i,
    );
  });
});
