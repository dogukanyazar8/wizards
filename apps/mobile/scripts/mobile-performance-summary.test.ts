import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  percentileMs,
  summarizeMobilePerformanceSamples,
} from "../src/performance/mobile-performance-summary";
import type { MobilePerformanceSample } from "../src/performance/mobile-performance-metrics";

function sample(
  overrides: Partial<MobilePerformanceSample> & { readonly durationMs: number },
): MobilePerformanceSample {
  return {
    context: {},
    metric: "navigation",
    sampleId: `sample-${overrides.durationMs}`,
    surface: "navigation",
    ...overrides,
  };
}

describe("percentileMs", () => {
  it("uses nearest rank so a single sample is its own percentile", () => {
    assert.equal(percentileMs([42], 50), 42);
    assert.equal(percentileMs([42], 99), 42);
  });

  it("matches the server rollup on a hundred ordered samples", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);

    assert.equal(percentileMs(values, 50), 50);
    assert.equal(percentileMs(values, 95), 95);
    assert.equal(percentileMs(values, 99), 99);
  });

  it("reports nothing for an empty set rather than zero", () => {
    assert.equal(percentileMs([], 95), null);
  });
});

describe("summarizeMobilePerformanceSamples", () => {
  /**
   * The panel reports the budget's metrics, not the raw surfaces: a launch is only
   * the headline once the session resolved, and a chat open means something
   * different when the stream was already cached.
   */
  it("maps authenticated content to the startup metric", () => {
    const rows = summarizeMobilePerformanceSamples([
      sample({
        context: { authenticated: true, phase: "content-visible" },
        durationMs: 1_800,
        metric: "startup",
        surface: "startup",
      }),
      // A shell drawn before the session resolved is not the launch number.
      sample({
        context: { authenticated: false, phase: "content-visible" },
        durationMs: 400,
        metric: "startup",
        surface: "startup",
      }),
    ]);

    const startup = rows.find((row) => row.metric === "startup");
    assert.equal(startup?.count, 1);
    assert.equal(startup?.p50Ms, 1_800);
  });

  it("splits chat opens by whether the stream was already cached", () => {
    const rows = summarizeMobilePerformanceSamples([
      sample({ context: { cacheHit: true, route: "DirectMessage" }, durationMs: 80 }),
      sample({ context: { cacheHit: false, route: "ChannelChat" }, durationMs: 420 }),
      sample({ context: { route: "ChannelChat" }, durationMs: 500 }),
    ]);

    assert.equal(rows.find((row) => row.metric === "chat-open-cached")?.count, 1);
    // An open with no cache flag counts as a network open: it is the safer bucket.
    assert.equal(rows.find((row) => row.metric === "chat-open-network")?.count, 2);
  });

  it("keeps the two halves of a send apart", () => {
    const rows = summarizeMobilePerformanceSamples([
      sample({ context: { phase: "send-echo" }, durationMs: 20 }),
      sample({ context: { phase: "send-ack" }, durationMs: 260 }),
    ]);

    assert.equal(rows.find((row) => row.metric === "send-echo")?.p95Ms, 20);
    assert.equal(rows.find((row) => row.metric === "send-ack")?.p95Ms, 260);
  });

  it("reports the resume span under its own metric", () => {
    const rows = summarizeMobilePerformanceSamples([
      sample({ context: { route: "Resume" }, durationMs: 300 }),
    ]);

    assert.equal(rows.find((row) => row.metric === "resume")?.count, 1);
  });

  it("lists a budgeted metric with no samples so an unmeasured gap is visible", () => {
    const rows = summarizeMobilePerformanceSamples([]);

    assert.ok(rows.every((row) => row.count === 0 && row.p95Ms === null));
    assert.deepEqual(
      rows.map((row) => row.metric),
      ["startup", "resume", "chat-open-cached", "chat-open-network", "send-echo", "send-ack"],
    );
  });

  it("ignores list-load render samples: they are not what the reader waited", () => {
    const rows = summarizeMobilePerformanceSamples([
      sample({ durationMs: 70, metric: "list-load", surface: "dm-messages" }),
    ]);

    assert.ok(rows.every((row) => row.count === 0));
  });
});
