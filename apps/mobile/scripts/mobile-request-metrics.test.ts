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
      headersMs: 320,
      path: "/api/v1/mobile/servers/server-abcdefghijklmnop",
      serverTimingHeader: "auth;dur=20.0, db;dur=70.0, total;dur=95.0",
    });

    assert.equal(sample.route, "/api/v1/mobile/servers/:id");
    assert.equal(sample.server.totalMs, 95);
    assert.equal(sample.transportMs, 225);
  });

  /**
   * The client used to stop its clock at the response headers, so ~21KB of
   * gzipped JSON and its parse happened after the only number anyone had.
   */
  it("keeps the body download and parse inside the settled number", () => {
    const sample = recordMobileRequestLatency({
      headersMs: 300,
      path: "/api/v1/mobile/dm/conversation-abcdefghijklmnop/messages",
      serverTimingHeader: "total;dur=250.0",
      settledMs: 460,
    });

    assert.equal(sample.headersMs, 300);
    assert.equal(sample.settledMs, 460);
    // Transport stays measured against the header, which is what the server's
    // own total lines up with.
    assert.equal(sample.transportMs, 50);
  });

  it("never settles before the response arrived, whatever the clock says", () => {
    const sample = recordMobileRequestLatency({
      headersMs: 300,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: null,
      settledMs: 120,
    });

    assert.equal(sample.settledMs, 300);
  });

  it("reports no transport split when the server did not measure itself", () => {
    const sample = recordMobileRequestLatency({
      headersMs: 120,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: null,
    });

    assert.equal(sample.transportMs, null);
  });

  it("never reports negative transport time when the clocks disagree", () => {
    const sample = recordMobileRequestLatency({
      headersMs: 40,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: "total;dur=95.0",
    });

    assert.equal(sample.transportMs, 0);
  });

  it("keeps a read and a write to the same path apart", () => {
    recordMobileRequestLatency({
      headersMs: 120,
      method: "get",
      path: "/api/v1/mobile/dm/conversation-abcdefghijklmnop/messages",
      serverTimingHeader: "total;dur=100",
    });
    recordMobileRequestLatency({
      headersMs: 900,
      method: "POST",
      path: "/api/v1/mobile/dm/conversation-abcdefghijklmnop/messages",
      serverTimingHeader: "total;dur=800",
    });

    assert.deepEqual(
      getMobileRequestLatencySnapshot().map((stats) => stats.key),
      ["GET /api/v1/mobile/dm/:id/messages", "POST /api/v1/mobile/dm/:id/messages"],
    );
  });

  it("refuses to mint a metric key from an unknown method", () => {
    recordMobileRequestLatency({
      headersMs: 10,
      method: 'TRACE";injected',
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: null,
    });

    assert.equal(getMobileRequestLatencySnapshot()[0]?.key, "OTHER /api/v1/mobile/bootstrap");
  });

  /**
   * One sample per route reported whichever request happened to be last as if it
   * were the route's latency. A percentile needs the distribution.
   */
  it("reports percentiles over the route's samples, not its last one", () => {
    for (const headersMs of [100, 200, 300, 400, 1_000]) {
      recordMobileRequestLatency({
        headersMs,
        method: "GET",
        path: "/api/v1/mobile/bootstrap",
        serverTimingHeader: "total;dur=50",
        settledMs: headersMs + 20,
      });
    }

    const [stats] = getMobileRequestLatencySnapshot();
    assert.equal(stats?.count, 5);
    assert.equal(stats?.headersP50Ms, 300);
    assert.equal(stats?.headersP95Ms, 1_000);
    assert.equal(stats?.settledP50Ms, 320);
    assert.equal(stats?.serverP95Ms, 50);
  });

  it("stays bounded in both keys and samples per key", () => {
    for (let index = 0; index < 60; index += 1) {
      recordMobileRequestLatency({
        headersMs: 10,
        method: "GET",
        path: `/api/v1/mobile/route-${index}`,
        serverTimingHeader: "total;dur=5",
      });
    }
    for (let index = 0; index < 200; index += 1) {
      recordMobileRequestLatency({
        headersMs: 10,
        method: "GET",
        path: "/api/v1/mobile/bootstrap",
        serverTimingHeader: "total;dur=5",
      });
    }

    const snapshot = getMobileRequestLatencySnapshot();
    assert.equal(snapshot.length, 40);
    assert.equal(
      snapshot.every((stats) => stats.count <= 60),
      true,
    );
  });
});

describe("slow request reporting", () => {
  it("only reports requests past the slow threshold", () => {
    const reported: string[] = [];
    setMobileLatencyReporter((sample) => reported.push(sample.route));

    recordMobileRequestLatency({
      headersMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS - 1,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: "total;dur=5",
    });
    assert.deepEqual(reported, []);

    recordMobileRequestLatency({
      headersMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS,
      path: "/api/v1/mobile/channels/0b6a4c1e9f2d4a118c33/messages",
      serverTimingHeader: "total;dur=5",
    });
    assert.deepEqual(reported, ["/api/v1/mobile/channels/:id/messages"]);
  });

  it("judges slowness by what the caller waited for, not by the headers", () => {
    const reported: number[] = [];
    setMobileLatencyReporter((sample) => reported.push(sample.settledMs));

    recordMobileRequestLatency({
      headersMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS - 200,
      path: "/api/v1/mobile/bootstrap",
      serverTimingHeader: null,
      settledMs: MOBILE_SLOW_REQUEST_THRESHOLD_MS + 100,
    });

    assert.deepEqual(reported, [MOBILE_SLOW_REQUEST_THRESHOLD_MS + 100]);
  });

  it("hands the reporter a route that carries no identifier", () => {
    const samples: { route: string }[] = [];
    setMobileLatencyReporter((sample) => samples.push(sample));

    recordMobileRequestLatency({
      headersMs: 5_000,
      path: "/api/v1/mobile/servers/0b6a4c1e-9f2d-4a11-8c33-5f7f9d2b1a44?cursor=abc",
      serverTimingHeader: null,
    });

    assert.equal(samples[0]?.route, "/api/v1/mobile/servers/:id");
    assert.equal(samples[0]?.route.includes("0b6a4c1e"), false);
  });
});
