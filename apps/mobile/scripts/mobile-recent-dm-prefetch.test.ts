import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_RECENT_DM_PREFETCH_LIMIT,
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchOpen,
  recordMobileRecentDMPrefetchSettled,
  resetMobileRecentDMPrefetchStats,
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

/**
 * A device run showed 4/4 warmed, which was not a measurement: the counter was
 * incremented before the request chain started, so it recorded the intent to
 * warm and every rate it produced was 100% by construction.
 */
describe("mobile recent DM prefetch hit rate", () => {
  it("counts a conversation as warmed only once its read has resolved", () => {
    resetMobileRecentDMPrefetchStats();
    recordMobileRecentDMPrefetch(["dm-1", "dm-2"]);
    recordMobileRecentDMPrefetchSettled("dm-1");

    const stats = getMobileRecentDMPrefetchStats();
    assert.equal(stats.attempted, 2);
    assert.equal(stats.settled, 1);
  });

  it("counts an open as a hit only when the warm had already landed", () => {
    resetMobileRecentDMPrefetchStats();
    recordMobileRecentDMPrefetch(["dm-1", "dm-2"]);
    recordMobileRecentDMPrefetchSettled("dm-1");
    recordMobileRecentDMPrefetchSettled("dm-2");

    recordMobileRecentDMPrefetchOpen("dm-1");
    // Never warmed at all: an open that the panel must not take credit for.
    recordMobileRecentDMPrefetchOpen("dm-9");

    const stats = getMobileRecentDMPrefetchStats();
    assert.equal(stats.openedAfterSettled, 1);
    assert.equal(stats.hitRate, 0.5);
  });

  it("ignores a settle for a conversation nothing tried to warm", () => {
    resetMobileRecentDMPrefetchStats();
    recordMobileRecentDMPrefetchSettled("dm-7");

    assert.equal(getMobileRecentDMPrefetchStats().settled, 0);
  });

  it("gives an open no credit while its warm is still in flight", () => {
    resetMobileRecentDMPrefetchStats();
    recordMobileRecentDMPrefetch(["dm-1"]);

    recordMobileRecentDMPrefetchOpen("dm-1");

    const stats = getMobileRecentDMPrefetchStats();
    assert.equal(stats.attempted, 1);
    assert.equal(stats.openedAfterSettled, 0);
    assert.equal(stats.hitRate, 0);
  });

  it("reports a zero rate rather than dividing by nothing", () => {
    resetMobileRecentDMPrefetchStats();

    assert.deepEqual(getMobileRecentDMPrefetchStats(), {
      attempted: 0,
      hitRate: 0,
      openedAfterSettled: 0,
      settled: 0,
    });
  });
});
