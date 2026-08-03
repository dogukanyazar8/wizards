import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import * as chatRouteTarget from "../src/performance/mobile-chat-route-target";
import {
  completeMobileNavigationSpan,
  markMobileNavigationStage,
  resetMobileNavigationTimingForTests,
} from "../src/performance/mobile-navigation-timing";
import {
  peekMobilePerformanceSamples,
  resetMobilePerformanceMetricsForTests,
} from "../src/performance/mobile-performance-metrics";
import {
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchSettled,
  resetMobileRecentDMPrefetchStatsForTests,
} from "../src/query/mobile-message-prefetch";
import type { MobileNavigationRouteIntent } from "../src/navigation/mobile-navigation-types";

type BeginMobileLinkedChatNavigationSpan = (
  intent: MobileNavigationRouteIntent,
  startedAtMs?: number,
) => string | null;

afterEach(() => {
  chatRouteTarget.setMobileChatCacheProbe(null);
  resetMobileNavigationTimingForTests();
  resetMobilePerformanceMetricsForTests();
  resetMobileRecentDMPrefetchStatsForTests();
});

describe("linked chat navigation timing", () => {
  it("starts the span before route commit and counts a settled DM prefetch hit", () => {
    const beginLinkedSpan = (
      chatRouteTarget as typeof chatRouteTarget & {
        readonly beginMobileLinkedChatNavigationSpan?: BeginMobileLinkedChatNavigationSpan;
      }
    ).beginMobileLinkedChatNavigationSpan;
    assert.equal(typeof beginLinkedSpan, "function");
    if (!beginLinkedSpan) return;

    chatRouteTarget.setMobileChatCacheProbe(() => 900);
    recordMobileRecentDMPrefetch(["conversation-1"]);
    recordMobileRecentDMPrefetchSettled("conversation-1");

    const sampleId = beginLinkedSpan(
      {
        name: "DirectMessage",
        params: { conversationId: "conversation-1" },
        type: "route",
      },
      1_000,
    );

    assert.ok(sampleId);
    assert.equal(markMobileNavigationStage("DirectMessage", "navigated", 1_120, sampleId), 120);
    assert.equal(completeMobileNavigationSpan("DirectMessage", 1_300, sampleId), 300);

    const sample = peekMobilePerformanceSamples().find(
      (candidate) => candidate.metric === "navigation" && candidate.context.stage === undefined,
    );
    assert.equal(sample?.context.cacheHit, true);
    assert.equal(sample?.context.origin, "navigation");
    assert.deepEqual(sample?.context.phases, {
      content: 300,
      "navigation-dispatched": 120,
    });
    assert.equal(getMobileRecentDMPrefetchStats().openedAfterSettled, 1);
  });
});
