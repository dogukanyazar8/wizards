import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getMobileRequestLatencySnapshot,
  parseMobileServerTiming,
  recordMobileRequestLatency,
  resetMobileLatencyReporterForTests,
  resetMobileRequestLatencyForTests,
  setMobileLatencyReporter,
  MOBILE_SLOW_REQUEST_THRESHOLD_MS,
  toMobileMetricRoute,
} from "../src/performance/mobile-request-metrics";

afterEach(() => {
  resetMobileRequestLatencyForTests();
  resetMobileLatencyReporterForTests();
});

describe("mobile server timing parsing", () => {
  it("reads the buckets the API emits", () => {
    assert.deepEqual(parseMobileServerTiming("auth;dur=12.3, db;dur=88.1, total;dur=101.2"), {
      authMs: 12.3,
      dbMs: 88.1,
      totalMs: 101.2,
    });
  });

  it("treats a missing, empty, or malformed header as no measurement", () => {
    const empty = { authMs: null, dbMs: null, totalMs: null };

    assert.deepEqual(parseMobileServerTiming(null), empty);
    assert.deepEqual(parseMobileServerTiming(""), empty);
    assert.deepEqual(parseMobileServerTiming("garbage"), empty);
    assert.deepEqual(parseMobileServerTiming("total"), empty);
    assert.deepEqual(parseMobileServerTiming("total;dur=nonsense"), empty);
    assert.deepEqual(parseMobileServerTiming("total;dur=-5"), empty);
  });

  it("ignores metrics it does not own instead of growing keys from a response", () => {
    const parsed = parseMobileServerTiming(
      'total;dur=10, __proto__;dur=1, constructor;dur=1, cache;desc="hit"',
    );

    assert.deepEqual(parsed, { authMs: null, dbMs: null, totalMs: 10 });
    assert.deepEqual(Object.keys(parsed).sort(), ["authMs", "dbMs", "totalMs"]);
  });

  it("clamps an implausible duration rather than trusting the header", () => {
    assert.equal(parseMobileServerTiming("total;dur=999999999").totalMs, 120_000);
  });
});

describe("mobile metric routes", () => {
  it("collapses identifiers so telemetry never carries a channel or server id", () => {
    assert.equal(
      toMobileMetricRoute("/api/v1/mobile/channels/0b6a4c1e-9f2d-4a11-8c33-5f7f9d2b1a44/messages"),
      "/api/v1/mobile/channels/:id/messages",
    );
    assert.equal(
      toMobileMetricRoute("/api/v1/mobile/servers/01JQZ8XKB4M9NR2VT6WY7C3DFG"),
      "/api/v1/mobile/servers/:id",
    );
    assert.equal(
      toMobileMetricRoute("/api/v1/mobile/dm/42/messages"),
      "/api/v1/mobile/dm/:id/messages",
    );
  });

  it("drops the query string, where cursors and search text live", () => {
    assert.equal(
      toMobileMetricRoute("/api/v1/mobile/channels/abc/messages?limit=30&cursor=secret"),
      "/api/v1/mobile/channels/abc/messages",
    );
  });

  it("leaves static routes untouched", () => {
    assert.equal(toMobileMetricRoute("/api/v1/mobile/bootstrap"), "/api/v1/mobile/bootstrap");
  });
});

describe("mobile request latency samples", () => {
  it("splits transport time out of the client round trip", () => {
    const sample = recordMobileRequestLatency({
      clientMs: 320,
      path: "/api/v1/mobile/servers/server-abcdefghijklmnop",
      serverTimingHeader: "auth;dur=20.0, db;dur=70.0, total;dur=95.0",
    });

    assert.equal(sample.route, "/api/v1/mobile/servers/:id");
    assert.equal(sample.server.totalMs, 95);
    assert.equal(sample.transportMs, 225);
  });

  it("reports no transport split when the server did not measure itself", () => {
    const sample = recordMobileRequestLatency({
      clientMs: 120,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: null,
    });

    assert.equal(sample.transportMs, null);
  });

  it("never reports negative transport time when the clocks disagree", () => {
    const sample = recordMobileRequestLatency({
      clientMs: 40,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: "total;dur=95.0",
    });

    assert.equal(sample.transportMs, 0);
  });

  it("keeps one sample per route and stays bounded", () => {
    for (let index = 0; index < 60; index += 1) {
      recordMobileRequestLatency({
        clientMs: 10,
        path: `/api/v1/mobile/route-${index}`,
        serverTimingHeader: "total;dur=5",
      });
    }

    assert.equal(getMobileRequestLatencySnapshot().length, 40);
  });
});

describe("slow request reporting", () => {
  it("only reports requests past the slow threshold", () => {
    const reported: string[] = [];
    setMobileLatencyReporter((sample) => reported.push(sample.route));

    recordMobileRequestLatency({
      clientMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS - 1,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: "total;dur=5",
    });
    assert.deepEqual(reported, []);

    recordMobileRequestLatency({
      clientMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS,
      path: "/api/v1/mobile/channels/0b6a4c1e9f2d4a118c33/messages",
      serverTimingHeader: "total;dur=5",
    });
    assert.deepEqual(reported, ["/api/v1/mobile/channels/:id/messages"]);
  });

  it("hands the reporter a route that carries no identifier", () => {
    const samples: { route: string }[] = [];
    setMobileLatencyReporter((sample) => samples.push(sample));

    recordMobileRequestLatency({
      clientMs: 5_000,
      path: "/api/v1/mobile/servers/0b6a4c1e-9f2d-4a11-8c33-5f7f9d2b1a44?cursor=abc",
      serverTimingHeader: null,
    });

    assert.equal(samples[0]?.route, "/api/v1/mobile/servers/:id");
    assert.equal(samples[0]?.route.includes("0b6a4c1e"), false);
  });
});
