import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  MOBILE_PERFORMANCE_REPORT_MAX_CHARS,
  buildMobilePerformanceReport,
  type MobilePerformanceReportInput,
} from "../src/performance/mobile-performance-report";

function buildInput(
  overrides: Partial<MobilePerformanceReportInput> = {},
): MobilePerformanceReportInput {
  return {
    blankArea: [{ count: 134, maxPx: 538, p50Px: 3, p95Px: 20, surface: "dm-messages" }],
    build: {
      appVersion: "0.8.15",
      backendBuildId: "backend-uat-42",
      buildId: "558f05bcce84",
      deviceTier: "high",
      environment: "uat",
      networkClass: "wifi",
      osName: "android",
      osVersion: "36",
    },
    chatContentClasses: [
      { count: 8, dimension: "message-count", p50Ms: 300, p95Ms: 480, value: "21-50" },
    ],
    chatOpenCohorts: [
      {
        count: 10,
        first5P50Ms: 410,
        last5P50Ms: 260,
        p50Ms: 320,
        p95Ms: 500,
        route: "DirectMessage",
        slopeMsPerSample: -12.5,
        source: "prefetch",
        transition: "slide",
      },
    ],
    chatOpenPhases: [{ count: 10, p50Ms: 90, p95Ms: 120, phase: "query-data-ready" }],
    chatOpenRoutes: [
      { cacheHit: true, count: 37, p50Ms: 1017, p95Ms: 1210.53, route: "DirectMessage" },
      { cacheHit: false, count: 0, p50Ms: null, p95Ms: null, route: "DirectMessage" },
    ],
    chatOpenSources: [
      { cacheAgeP50Ms: null, count: 0, p50Ms: null, p95Ms: null, source: "sqlcipher" },
      { cacheAgeP50Ms: 1_000, count: 37, p50Ms: 1017, p95Ms: 1210.53, source: "prefetch" },
    ],
    chatOpenStages: [{ count: 45, p50Ms: 101.03, p95Ms: 163.63, stage: "navigated" }],
    eventLoop: { count: 24, maxMs: 91, p50Ms: 4, p95Ms: 37 },
    generatedAt: "2026-07-31T11:53:00.000Z",
    metrics: [
      { count: 44, metric: "chat-open-cached", p50Ms: 955.52, p95Ms: 1190.03, p99Ms: 1440.37 },
    ],
    prefetch: { attempted: 4, hitRate: 0.75, openedAfterSettled: 3, settled: 4 },
    requestLatency: [
      {
        count: 37,
        headersP50Ms: 241,
        headersP95Ms: 527,
        key: "GET /api/v1/mobile/bootstrap",
        lastRequestId: "abcdef0123456789abcdef0123456789",
        lastServer: { authMs: 12.4, dbMs: 26.6, totalMs: 48.9 },
        method: "GET",
        route: "/api/v1/mobile/bootstrap",
        serverP50Ms: 48.9,
        serverP95Ms: 106,
        settledP50Ms: 249,
        settledP95Ms: 530,
        transportP95Ms: 471.3,
      },
    ],
    sampleCount: 270,
    spans: { abandoned: 0, open: 0 },
    startupPhases: { "bundle-loaded": 76.4, interactive: 591 },
    storage: { cipherVersion: "4.7.0 community", rowCount: 6, status: "open" },
    transitions: [{ count: 16, p50Ms: 589.03, p95Ms: 1210.53, variant: "slide" }],
    ...overrides,
  };
}

describe("mobile performance report", () => {
  it("puts the run identity at the top", () => {
    const report = buildMobilePerformanceReport(buildInput());
    assert.match(report, /^Whispr mobile performance report\n/u);
    assert.match(report, /generated 2026-07-31T11:53:00\.000Z/u);
    assert.match(report, /client 558f05bcce84 .* backend backend-uat-42/u);
    assert.match(report, /samples 270/u);
  });

  it("carries every diagnostic section", () => {
    const report = buildMobilePerformanceReport(buildInput());
    for (const heading of [
      "## budget metrics",
      "## chat open stages",
      "## chat open phases",
      "## route source transition cohorts",
      "## row and content classes",
      "## JS event-loop lag",
      "## chat open by surface",
      "## chat open source",
      "## transition A/B",
      "## blank area",
      "## startup phases",
      "## encrypted message store",
      "## prefetch",
      "## spans",
      "## request timing",
    ]) {
      assert.ok(report.includes(heading), `report is missing ${heading}`);
    }
  });

  it("reads an unmeasured row as a gap rather than zero", () => {
    const report = buildMobilePerformanceReport(buildInput());
    assert.match(report, /sqlcipher\s+n=0\s+- \/ -/u);
    assert.match(report, /DirectMessage-network\s+n=0\s+- \/ -/u);
  });

  it("keeps the numbers needed to compare a wave", () => {
    const report = buildMobilePerformanceReport(buildInput());
    assert.match(report, /chat-open-cached\s+n=44\s+955\.52 \/ 1190\.03 \/ 1440\.37/u);
    assert.match(report, /DirectMessage-cached\s+n=37\s+1017 \/ 1210\.53/u);
    assert.match(report, /dm-messages\s+n=134\s+3 \/ 20 \/ 538/u);
    assert.match(report, /4 \/ 4 \/ 3 .* 75%/u);
    assert.match(report, /hdr 241\/527 .* settled 249\/530/u);
    assert.match(report, /last auth 12\.4 \/ last db 26\.6/u);
    assert.match(report, /req abcdef0123456789abcdef0123456789/u);
  });

  it("survives an empty run", () => {
    const report = buildMobilePerformanceReport(
      buildInput({
        blankArea: [],
        chatContentClasses: [],
        chatOpenCohorts: [],
        chatOpenPhases: [],
        chatOpenRoutes: [],
        chatOpenSources: [],
        chatOpenStages: [],
        metrics: [],
        requestLatency: [],
        sampleCount: 0,
        startupPhases: {},
        storage: null,
        transitions: [],
      }),
    );
    assert.ok(report.includes("(no measurements)"));
  });

  it("carries timings and no reader content or identity", () => {
    const report = buildMobilePerformanceReport(buildInput());
    assert.equal(report.includes("conversation-"), false);
    assert.equal(report.includes("@"), false);
    assert.match(report, /\/api\/v1\/mobile\/bootstrap/u);
  });

  it("redacts a path token and keeps the report bounded", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9supersecrettoken";
    const base = buildInput();
    const request = base.requestLatency[0]!;
    const report = buildMobilePerformanceReport(
      buildInput({
        chatOpenCohorts: Array.from({ length: 500 }, () => base.chatOpenCohorts[0]!),
        requestLatency: [
          {
            ...request,
            key: `GET /api/v1/mobile/messages/${token}`,
            route: `/api/v1/mobile/messages/${token}`,
          },
        ],
      }),
    );
    assert.equal(report.includes(token), false);
    assert.ok(report.length <= MOBILE_PERFORMANCE_REPORT_MAX_CHARS);
  });

  it("is reachable only from the diagnostics panel", () => {
    const screen = readFileSync(
      path.join(__dirname, "..", "src/app/screens/mobile-performance-diagnostics-screen.tsx"),
      "utf8",
    );
    assert.match(screen, /testID="performance-export"/u);
    assert.match(screen, /Share\.share\(\{ message: report \}\)/u);
    assert.match(screen, /buildMobilePerformanceReport\(\{/u);
  });
});
