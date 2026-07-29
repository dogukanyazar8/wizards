import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  MOBILE_PERFORMANCE_SAMPLE_CAP,
  drainMobilePerformanceSamples,
  peekMobilePerformanceSamples,
  recordMobilePerformanceSample,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import {
  getMobileStartupPhaseTimeline,
  markMobileStartupPhase,
  resetMobileStartupPhasesForTests,
} from "../src/performance/mobile-startup-phases";
import { toHealthEvents } from "../src/performance/mobile-health-reporter";
import {
  MOBILE_NAVIGATION_SPAN_MAX_AGE_MS,
  beginMobileNavigationSpan,
  completeMobileNavigationSpan,
  ensureMobileNavigationSpan,
  getMobileNavigationSpanDiagnostics,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import { resolveMobileActiveChatRouteTarget } from "../src/performance/mobile-chat-route-target";
import {
  abandonMobileSendSpan,
  beginMobileSendSpan,
  completeMobileSendAck,
  completeMobileSendEcho,
  resetMobileSendTimingForTests,
} from "../src/performance/mobile-send-timing";

beforeEach(() => {
  resetMobilePerformanceMetricsForTests();
  resetMobileStartupPhasesForTests();
  resetMobileNavigationTimingForTests();
  resetMobileSendTimingForTests();
});

describe("performance sample log", () => {
  // The old store was a Map keyed by surface: a second measurement of the same
  // screen overwrote the first, so a session reported one sample per surface no
  // matter how many times the reader opened it.
  it("keeps every sample instead of the last one per surface", () => {
    recordMobilePerformanceSample({ durationMs: 120, metric: "list-load", surface: "dm-messages" });
    recordMobilePerformanceSample({ durationMs: 340, metric: "list-load", surface: "dm-messages" });

    assert.deepEqual(
      peekMobilePerformanceSamples().map((sample) => sample.durationMs),
      [120, 340],
    );
  });

  it("gives every sample its own id so the backend can dedupe", () => {
    recordMobilePerformanceSample({ durationMs: 10, metric: "list-load", surface: "dm-inbox" });
    recordMobilePerformanceSample({ durationMs: 10, metric: "list-load", surface: "dm-inbox" });

    const ids = peekMobilePerformanceSamples().map((sample) => sample.sampleId);
    assert.equal(new Set(ids).size, 2);
    assert.ok(ids.every((id) => id.length > 0));
  });

  // The bridge used to re-enqueue the whole snapshot on every 60s tick, so the
  // same measurement was sent again and again.
  it("drains what it hands out so nothing is reported twice", () => {
    recordMobilePerformanceSample({ durationMs: 10, metric: "startup", surface: "startup" });

    const first = drainMobilePerformanceSamples();
    const second = drainMobilePerformanceSamples();

    assert.equal(first.length, 1);
    assert.deepEqual(second, []);
  });

  it("drops the oldest samples rather than growing without bound", () => {
    for (let index = 0; index < MOBILE_PERFORMANCE_SAMPLE_CAP + 5; index += 1) {
      recordMobilePerformanceSample({
        durationMs: index,
        metric: "list-load",
        surface: "channel-messages",
      });
    }

    const samples = peekMobilePerformanceSamples();
    assert.equal(samples.length, MOBILE_PERFORMANCE_SAMPLE_CAP);
    assert.equal(samples[0]?.durationMs, 5);
  });

  it("carries the caller's context so a sample can be sliced later", () => {
    recordMobilePerformanceSample({
      context: { cacheHit: true, route: "DirectMessage" },
      durationMs: 42,
      metric: "navigation",
      surface: "navigation",
    });

    assert.deepEqual(peekMobilePerformanceSamples()[0]?.context, {
      cacheHit: true,
      route: "DirectMessage",
    });
  });
});

describe("startup phases", () => {
  it("measures each phase from one origin", () => {
    markMobileStartupPhase("bundle-loaded", 100);
    markMobileStartupPhase("root-first-frame", 250);
    markMobileStartupPhase("auth-resolved", 400);

    const timeline = getMobileStartupPhaseTimeline();
    assert.equal(timeline["root-first-frame"], 250);
    assert.equal(timeline["auth-resolved"], 400);
  });

  it("keeps the first mark: a re-render must not restate the phase", () => {
    markMobileStartupPhase("root-first-frame", 250);

    assert.equal(markMobileStartupPhase("root-first-frame", 900), null);
    assert.equal(getMobileStartupPhaseTimeline()["root-first-frame"], 250);
  });

  /**
   * The old marker sat above the auth and font gates, so it reported "startup"
   * for a frame that showed nothing a reader wanted. Content is only the real
   * headline once the session has resolved, and the sample says which it was.
   */
  it("records whether the session had resolved when content appeared", () => {
    markMobileStartupPhase("auth-resolved", 400);
    markMobileStartupPhase("content-visible", 700);

    const contentSample = peekMobilePerformanceSamples().find(
      (sample) => sample.context.phase === "content-visible",
    );
    assert.equal(contentSample?.durationMs, 700);
    assert.equal(contentSample?.context.authenticated, true);
  });

  it("flags content that appeared before the session resolved", () => {
    markMobileStartupPhase("content-visible", 300);

    const contentSample = peekMobilePerformanceSamples().find(
      (sample) => sample.context.phase === "content-visible",
    );
    assert.equal(contentSample?.context.authenticated, false);
  });
});

describe("navigation spans", () => {
  // FlashList's onLoad measures rendering the visible children. It is not what
  // the reader feels, which starts at the tap.
  it("measures the tap that opened a route through to its content", () => {
    beginMobileNavigationSpan("DirectMessage", 1_000);

    assert.equal(completeMobileNavigationSpan("DirectMessage", 1_250), 250);
    const sample = peekMobilePerformanceSamples().at(-1);
    assert.equal(sample?.metric, "navigation");
    assert.equal(sample?.durationMs, 250);
    assert.equal(sample?.context.route, "DirectMessage");
  });

  it("ignores content that belongs to a route nobody tapped", () => {
    assert.equal(completeMobileNavigationSpan("ChannelChat", 1_250), null);
    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });

  it("completes a span once: a list that re-renders does not report again", () => {
    beginMobileNavigationSpan("ChannelChat", 1_000);
    completeMobileNavigationSpan("ChannelChat", 1_100);

    assert.equal(completeMobileNavigationSpan("ChannelChat", 1_400), null);
    assert.equal(peekMobilePerformanceSamples().length, 1);
  });

  it("lets the newest tap replace an abandoned one for the same route", () => {
    beginMobileNavigationSpan("ChannelChat", 1_000);
    beginMobileNavigationSpan("ChannelChat", 1_500);

    assert.equal(completeMobileNavigationSpan("ChannelChat", 1_600), 100);
  });

  /**
   * A device run reported `resume` as 60000ms — the clamp ceiling — from a single
   * sample, because the span stayed open until some unrelated content rendered
   * minutes later. A span that old is not a slow open; it is a lost one, and
   * recording it poisons the percentile it lands in.
   */
  it("drops a span that stayed open past the age limit instead of recording it", () => {
    beginMobileNavigationSpan("Resume", 1_000);

    assert.equal(
      completeMobileNavigationSpan("Resume", 1_000 + MOBILE_NAVIGATION_SPAN_MAX_AGE_MS + 1),
      null,
    );
    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });

  it("keeps a span that closes exactly on the age limit", () => {
    beginMobileNavigationSpan("Resume", 1_000);

    assert.equal(
      completeMobileNavigationSpan("Resume", 1_000 + MOBILE_NAVIGATION_SPAN_MAX_AGE_MS),
      MOBILE_NAVIGATION_SPAN_MAX_AGE_MS,
    );
  });

  it("drops a span whose clock ran backwards", () => {
    beginMobileNavigationSpan("ChannelChat", 2_000);

    assert.equal(completeMobileNavigationSpan("ChannelChat", 1_900), null);
    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });

  /**
   * Ten resumes produced one sample: every new span silently replaced the one
   * before it. The replacements are still lost, but they are now countable — an
   * unmeasured gap has to be visible rather than inferred from a low `n`.
   */
  it("counts the spans it lost so the panel can show the gap", () => {
    beginMobileNavigationSpan("Resume", 1_000);
    beginMobileNavigationSpan("Resume", 2_000);
    beginMobileNavigationSpan("Resume", 3_000);
    completeMobileNavigationSpan("Resume", 3_100);

    beginMobileNavigationSpan("ChannelChat", 1_000);
    completeMobileNavigationSpan("ChannelChat", 1_000 + MOBILE_NAVIGATION_SPAN_MAX_AGE_MS + 1);

    const diagnostics = getMobileNavigationSpanDiagnostics();
    assert.equal(diagnostics.abandoned, 3, "two replaced spans plus one expired");
    assert.equal(diagnostics.open, 0);
  });

  it("reports the spans still waiting for content", () => {
    beginMobileNavigationSpan("DirectMessage", 1_000);

    assert.equal(getMobileNavigationSpanDiagnostics().open, 1);
    completeMobileNavigationSpan("DirectMessage", 1_100);
    assert.equal(getMobileNavigationSpanDiagnostics().open, 0);
  });

  /**
   * A device run measured twelve of roughly twenty-three opens with zero
   * abandoned spans: the missing ones never started, because only two tap
   * handlers opened spans and half the entry points — deep links, push intents,
   * profile cards — never pass through them.
   */
  it("opens a span for a route nothing tapped", () => {
    ensureMobileNavigationSpan("DirectMessage", 1_000);

    assert.equal(completeMobileNavigationSpan("DirectMessage", 1_400), 400);
    assert.equal(peekMobilePerformanceSamples().at(-1)?.context.origin, "navigation");
  });

  it("leaves a tap's span alone: the tap is the better origin", () => {
    beginMobileNavigationSpan("ChannelChat", 1_000, true);
    ensureMobileNavigationSpan("ChannelChat", 1_300);

    assert.equal(completeMobileNavigationSpan("ChannelChat", 1_500), 500);
    const sample = peekMobilePerformanceSamples().at(-1);
    assert.equal(sample?.context.origin, "tap");
    assert.equal(sample?.context.cacheHit, true);
  });

  it("does not count an ensured span as abandoned", () => {
    beginMobileNavigationSpan("DirectMessage", 1_000);
    ensureMobileNavigationSpan("DirectMessage", 1_100);

    assert.equal(getMobileNavigationSpanDiagnostics().abandoned, 0);
  });
});

describe("active chat route", () => {
  const chatState = (name: string, params: unknown) => ({
    index: 0,
    routes: [
      {
        name: "MainTabs",
        state: { index: 1, routes: [{ name: "Sohbetler" }, { name, params }] },
      },
    ],
  });

  it("reads the focused chat and its target", () => {
    assert.deepEqual(
      resolveMobileActiveChatRouteTarget(chatState("DirectMessage", { conversationId: "dm-1" })),
      { route: "DirectMessage", targetId: "dm-1" },
    );
    assert.deepEqual(
      resolveMobileActiveChatRouteTarget(
        chatState("ChannelChat", { channelId: "channel-1", serverId: "server-1" }),
      ),
      { route: "ChannelChat", targetId: "channel-1" },
    );
  });

  it("ignores a screen that is not a chat", () => {
    assert.equal(resolveMobileActiveChatRouteTarget(chatState("Settings", {})), null);
    assert.equal(resolveMobileActiveChatRouteTarget(undefined), null);
    assert.equal(resolveMobileActiveChatRouteTarget({ index: 0, routes: [] }), null);
  });

  it("ignores a chat that is not the focused screen", () => {
    const state = {
      index: 1,
      routes: [
        { name: "DirectMessage", params: { conversationId: "dm-1" } },
        { name: "UserProfile", params: { userId: "user-1" } },
      ],
    };

    assert.equal(resolveMobileActiveChatRouteTarget(state), null);
  });

  it("ignores a chat route with no target to open", () => {
    assert.equal(resolveMobileActiveChatRouteTarget(chatState("DirectMessage", {})), null);
    assert.equal(
      resolveMobileActiveChatRouteTarget(chatState("DirectMessage", { conversationId: "" })),
      null,
    );
  });
});

describe("telemetry dimensions", () => {
  const resolver = () => ({
    appVersion: "0.8.15",
    buildId: "build-42",
    deviceTier: "mid" as const,
    environment: "uat" as const,
    networkClass: "cellular" as const,
    osName: "android" as const,
    osVersion: "14",
  });

  /**
   * A p95 that mixes builds, platforms and device classes is not a number anyone
   * can act on, so every sample carries what it needs to be sliced.
   */
  it("stamps each event with the build, platform and network it came from", () => {
    recordMobilePerformanceSample({
      context: { route: "ChannelChat" },
      durationMs: 120,
      metric: "navigation",
      surface: "navigation",
    });

    const [event] = toHealthEvents(drainMobilePerformanceSamples(), resolver);

    assert.equal(event?.kind, "SCREEN_LOAD");
    assert.equal(event?.valueMs, 120);
    assert.equal(event?.context?.route, "ChannelChat");
    assert.equal(event?.context?.buildId, "build-42");
    assert.equal(event?.context?.osName, "android");
    assert.equal(event?.context?.deviceTier, "mid");
    assert.equal(event?.context?.networkClass, "cellular");
    assert.ok(typeof event?.context?.sampleId === "string");
  });

  it("maps a startup phase to the startup kind", () => {
    markMobileStartupPhase("content-visible", 900);

    const [event] = toHealthEvents(drainMobilePerformanceSamples(), resolver);

    assert.equal(event?.kind, "STARTUP");
    assert.equal(event?.context?.phase, "content-visible");
  });

  it("still produces an event when the device facts cannot be read", () => {
    recordMobilePerformanceSample({ durationMs: 5, metric: "list-load", surface: "dm-inbox" });

    const [event] = toHealthEvents(drainMobilePerformanceSamples(), () => {
      throw new Error("native module unavailable");
    });

    assert.equal(event?.kind, "SCREEN_LOAD");
    assert.equal(event?.valueMs, 5);
    assert.ok(typeof event?.context?.sampleId === "string");
  });
});

describe("send spans", () => {
  /**
   * Two numbers the reader feels separately: the bubble appearing, and the server
   * confirming it. A single "send latency" hides which of the two is slow.
   */
  it("measures the echo and the ack from the same tap", () => {
    beginMobileSendSpan("nonce-1", 1_000);

    assert.equal(completeMobileSendEcho("nonce-1", 1_030), 30);
    assert.equal(completeMobileSendAck("nonce-1", 1_240), 240);

    const samples = peekMobilePerformanceSamples();
    assert.deepEqual(
      samples.map((sample) => sample.context.phase),
      ["send-echo", "send-ack"],
    );
    assert.deepEqual(
      samples.map((sample) => sample.durationMs),
      [30, 240],
    );
  });

  it("reports the echo once and keeps the span open for the ack", () => {
    beginMobileSendSpan("nonce-1", 1_000);
    completeMobileSendEcho("nonce-1", 1_030);

    assert.equal(completeMobileSendEcho("nonce-1", 1_060), null);
    assert.equal(completeMobileSendAck("nonce-1", 1_200), 200);
  });

  it("closes the span for good on the ack", () => {
    beginMobileSendSpan("nonce-1", 1_000);
    completeMobileSendAck("nonce-1", 1_200);

    assert.equal(completeMobileSendAck("nonce-1", 1_400), null);
  });

  it("ignores a send it never saw start", () => {
    assert.equal(completeMobileSendEcho("unknown", 1_000), null);
    assert.equal(completeMobileSendAck("unknown", 1_000), null);
    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });

  it("forgets a failed send rather than leaking the span", () => {
    beginMobileSendSpan("nonce-1", 1_000);
    abandonMobileSendSpan("nonce-1");

    assert.equal(completeMobileSendAck("nonce-1", 1_200), null);
  });
});
