import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  forgetMobileMessageStreamOrigin,
  markMobileMessageStreamPrefetched,
  markMobileMessageStreamRestored,
  resetMobileMessageStreamSourcesForTests,
  resolveMobileMessageStreamOpenSource,
} from "../src/query/mobile-message-stream-source";
import {
  summarizeMobileChatOpenRoutes,
  summarizeMobileChatOpenSources,
} from "../src/performance/mobile-performance-summary";
import { selectMobileRecentDMRestoreIds } from "../src/query/mobile-message-prefetch";

afterEach(() => {
  resetMobileMessageStreamSourcesForTests();
});

const NOW = 1_700_000_100_000;

describe("chat open source", () => {
  it("calls an open with nothing cached a network open", () => {
    assert.deepEqual(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: null,
        now: NOW,
        scope: "dm",
        targetId: "conversation-1",
      }),
      { cacheAgeMs: null, source: "network" },
    );
  });

  it("reports the encrypted store with the age of the page it restored", () => {
    const storedAt = NOW - 90_000;
    markMobileMessageStreamRestored("dm", "conversation-1", storedAt);

    assert.deepEqual(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: storedAt,
        now: NOW,
        scope: "dm",
        targetId: "conversation-1",
      }),
      { cacheAgeMs: 90_000, source: "sqlcipher" },
    );
  });

  it("tells a settled warm apart from a stream the session already held", () => {
    markMobileMessageStreamPrefetched("dm", "conversation-1", NOW - 5_000);

    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: NOW - 5_000,
        now: NOW,
        scope: "dm",
        targetId: "conversation-1",
      }).source,
      "prefetch",
    );
    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: NOW - 5_000,
        now: NOW,
        scope: "dm",
        targetId: "conversation-2",
      }).source,
      "memory",
    );
  });

  it("stops crediting the restore once the network has answered", () => {
    markMobileMessageStreamRestored("dm", "conversation-1", NOW - 90_000);

    // The refetch that reconciles the stale page also ends its claim on the open.
    assert.deepEqual(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: NOW - 1_000,
        now: NOW,
        scope: "dm",
        targetId: "conversation-1",
      }),
      { cacheAgeMs: null, source: "memory" },
    );
  });

  it("keeps the two scopes apart", () => {
    markMobileMessageStreamRestored("channel", "target-1", NOW - 1_000);

    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: NOW - 1_000,
        now: NOW,
        scope: "dm",
        targetId: "target-1",
      }).source,
      "memory",
    );
  });

  it("forgets an origin the revoked-stream drop took away", () => {
    markMobileMessageStreamRestored("dm", "conversation-1", NOW - 1_000);
    forgetMobileMessageStreamOrigin("dm", "conversation-1");

    assert.equal(
      resolveMobileMessageStreamOpenSource({
        dataUpdatedAtMs: NOW - 1_000,
        now: NOW,
        scope: "dm",
        targetId: "conversation-1",
      }).source,
      "memory",
    );
  });

  it("summarizes the four sources apart, with every one visible at zero", () => {
    const rows = summarizeMobileChatOpenSources([
      {
        context: { cacheAgeMs: 60_000, route: "DirectMessage", source: "sqlcipher" },
        durationMs: 210,
        metric: "navigation",
      },
      {
        context: { cacheAgeMs: null, route: "DirectMessage", source: "network" },
        durationMs: 1_300,
        metric: "navigation",
      },
      {
        context: { route: "DirectMessage", source: "network", stage: "mounted" },
        durationMs: 90,
        metric: "navigation",
      },
    ]);

    assert.deepEqual(
      rows.map((row) => [row.source, row.count, row.p50Ms, row.cacheAgeP50Ms]),
      [
        ["memory", 0, null, null],
        ["sqlcipher", 1, 210, 60_000],
        ["prefetch", 0, null, null],
        ["network", 1, 1_300, null],
      ],
    );
  });
});

describe("chat open by surface", () => {
  it("reports the DM transcript and the channel apart", () => {
    const rows = summarizeMobileChatOpenRoutes([
      {
        context: { cacheHit: true, route: "DirectMessage" },
        durationMs: 200,
        metric: "navigation",
      },
      { context: { cacheHit: true, route: "ChannelChat" }, durationMs: 460, metric: "navigation" },
      {
        context: { cacheHit: false, route: "DirectMessage" },
        durationMs: 900,
        metric: "navigation",
      },
      // Stages are milestones inside an open, and `Resume` is not a chat at all.
      {
        context: { cacheHit: true, route: "DirectMessage", stage: "mounted" },
        durationMs: 40,
        metric: "navigation",
      },
      { context: { route: "Resume" }, durationMs: 300, metric: "navigation" },
    ]);

    assert.deepEqual(
      rows.map((row) => [row.route, row.cacheHit, row.count, row.p95Ms]),
      [
        ["DirectMessage", true, 1, 200],
        ["DirectMessage", false, 1, 900],
        ["ChannelChat", true, 1, 460],
        ["ChannelChat", false, 0, null],
      ],
    );
  });
});

describe("recent DM restore selection", () => {
  it("takes the newest conversations the inbox already resolved", () => {
    assert.deepEqual(
      selectMobileRecentDMRestoreIds({
        conversations: [{ id: "a" }, { id: "b" }, { id: "c" }],
        limit: 2,
      }),
      ["a", "b"],
    );
  });

  it("restores nothing when there is nothing to restore", () => {
    assert.deepEqual(selectMobileRecentDMRestoreIds({ conversations: [{ id: "" }], limit: 3 }), []);
    assert.deepEqual(
      selectMobileRecentDMRestoreIds({ conversations: [{ id: "a" }], limit: 0 }),
      [],
    );
  });
});
