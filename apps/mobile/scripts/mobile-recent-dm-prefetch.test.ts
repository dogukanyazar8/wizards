import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_RECENT_DM_PREFETCH_LIMIT,
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchOpen,
  resetMobileRecentDMPrefetchStatsForTests,
  selectMobileRecentDMPrefetchIds,
  shouldWarmMobileRecentDMs,
} from "../src/query/mobile-message-prefetch";

function buildConversation(id: string, unreadCount = 0) {
  return { id, unreadCount };
}

describe("selectMobileRecentDMPrefetchIds", () => {
  it("warms the newest conversations up to the limit", () => {
    const ids = selectMobileRecentDMPrefetchIds({
      conversations: [
        buildConversation("dm-1"),
        buildConversation("dm-2"),
        buildConversation("dm-3"),
        buildConversation("dm-4"),
        buildConversation("dm-5"),
      ],
      selectedConversationId: null,
    });

    assert.equal(ids.length, MOBILE_RECENT_DM_PREFETCH_LIMIT);
    assert.deepEqual(ids, ["dm-1", "dm-2", "dm-3"].slice(0, MOBILE_RECENT_DM_PREFETCH_LIMIT));
  });

  it("skips the conversation that is already open", () => {
    const ids = selectMobileRecentDMPrefetchIds({
      conversations: [buildConversation("dm-1"), buildConversation("dm-2")],
      selectedConversationId: "dm-1",
    });

    assert.deepEqual(ids, ["dm-2"]);
  });

  it("drops blank ids and duplicates", () => {
    const ids = selectMobileRecentDMPrefetchIds({
      conversations: [buildConversation(""), buildConversation("dm-1"), buildConversation("dm-1")],
      selectedConversationId: null,
    });

    assert.deepEqual(ids, ["dm-1"]);
  });

  it("warms nothing when the limit is zero", () => {
    const ids = selectMobileRecentDMPrefetchIds({
      conversations: [buildConversation("dm-1")],
      limit: 0,
      selectedConversationId: null,
    });

    assert.deepEqual(ids, []);
  });
});

/**
 * Speculation costs the reader: every warmed conversation is a real read on the
 * backend and bytes on their link. The budget is what keeps it from being rude.
 */
describe("shouldWarmMobileRecentDMs", () => {
  const allowed = {
    appState: "active" as const,
    isMetered: false,
    isSignedIn: true,
  };

  it("warms only in the foreground", () => {
    assert.equal(shouldWarmMobileRecentDMs(allowed), true);
    assert.equal(shouldWarmMobileRecentDMs({ ...allowed, appState: "background" }), false);
    assert.equal(shouldWarmMobileRecentDMs({ ...allowed, appState: "inactive" }), false);
  });

  it("never speculates on a metered link", () => {
    assert.equal(shouldWarmMobileRecentDMs({ ...allowed, isMetered: true }), false);
  });

  it("does nothing for a signed-out device", () => {
    assert.equal(shouldWarmMobileRecentDMs({ ...allowed, isSignedIn: false }), false);
  });
});

describe("mobile recent DM prefetch hit rate", () => {
  it("counts a warmed conversation as a hit only when it is opened", () => {
    resetMobileRecentDMPrefetchStatsForTests();
    recordMobileRecentDMPrefetch(["dm-1", "dm-2"]);

    recordMobileRecentDMPrefetchOpen("dm-1");
    recordMobileRecentDMPrefetchOpen("dm-9");

    const stats = getMobileRecentDMPrefetchStats();
    assert.equal(stats.warmed, 2);
    assert.equal(stats.hits, 1);
    assert.equal(stats.hitRate, 0.5);
  });

  it("reports a zero rate rather than dividing by nothing", () => {
    resetMobileRecentDMPrefetchStatsForTests();

    assert.deepEqual(getMobileRecentDMPrefetchStats(), { hitRate: 0, hits: 0, warmed: 0 });
  });
});
