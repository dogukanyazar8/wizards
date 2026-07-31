import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  percentileMs,
  summarizeMobileChatContentClasses,
  summarizeMobileChatOpenCohorts,
  summarizeMobileChatOpenPhases,
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
    sampleOrdinal: overrides.sampleOrdinal ?? 1,
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

describe("chat-open diagnostic summaries", () => {
  it("summarizes every recorded route-owned phase", () => {
    const rows = summarizeMobileChatOpenPhases([
      sample({
        context: {
          phases: {
            content: 420,
            "message-model-built": 180,
            "query-data-ready": 120,
            tap: 0,
          },
          route: "DirectMessage",
        },
        durationMs: 420,
      }),
    ]);

    assert.equal(rows.find((row) => row.phase === "query-data-ready")?.p50Ms, 120);
    assert.equal(rows.find((row) => row.phase === "content")?.p95Ms, 420);
  });

  it("reports route-source-transition cohorts with warm-up trend", () => {
    const samples = Array.from({ length: 10 }, (_, index) =>
      sample({
        context: {
          route: "DirectMessage",
          sampleOrdinal: index + 1,
          source: "prefetch",
          transition: "slide",
        },
        durationMs: 100 + index * 10,
        sampleOrdinal: index + 1,
      }),
    );

    const row = summarizeMobileChatOpenCohorts(samples).find(
      (entry) =>
        entry.route === "DirectMessage" &&
        entry.source === "prefetch" &&
        entry.transition === "slide",
    );
    assert.equal(row?.count, 10);
    assert.equal(row?.first5P50Ms, 120);
    assert.equal(row?.last5P50Ms, 170);
    assert.equal(row?.slopeMsPerSample, 10);
  });

  it("keeps message and rich-content classes bounded", () => {
    const rows = summarizeMobileChatContentClasses([
      sample({
        context: {
          attachmentCountClass: "1-5",
          messageCount: 37,
          reactionCountClass: "6-20",
          richContentCountClass: "1-5",
          route: "DirectMessage",
          visibleInitialRowCount: 12,
        },
        durationMs: 300,
      }),
    ]);

    assert.ok(rows.some((row) => row.dimension === "message-count" && row.value === "21-50"));
    assert.ok(rows.some((row) => row.dimension === "visible-rows" && row.value === "6-20"));
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
