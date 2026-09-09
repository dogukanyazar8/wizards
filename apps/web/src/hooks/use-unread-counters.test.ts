import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { MentionCounts } from "@wizards/types";

import { applyMentionCountsToSummary, isMentionNotification } from "@/hooks/use-unread-counters";
import type { AppSummaryResponse } from "@/lib/home/types";

const SOURCE = readFileSync(join(process.cwd(), "src/hooks/use-unread-counters.ts"), "utf8");

const SUMMARY: AppSummaryResponse = {
  dateLabel: "2026-08-26T12:00:00.000Z",
  dmUnread: 2,
  focus: null,
  greetingName: "Alice",
  pendingReplies: 1,
  presence: "ONLINE",
  unreadMentions: 3,
};

const COUNTS: MentionCounts = {
  all: 8,
  bySource: { "server-1": 5 },
  everyone: 1,
  me: 4,
  readLater: 1,
  role: 2,
  roleNames: ["Admin"],
  thread: 0,
  unread: 6,
};

describe("useUnreadCounters mention realtime bridge", () => {
  it("uses the authoritative unread count without changing other summary fields", () => {
    assert.deepEqual(applyMentionCountsToSummary(SUMMARY, COUNTS), {
      ...SUMMARY,
      unreadMentions: 6,
    });
    assert.equal(applyMentionCountsToSummary(undefined, COUNTS), undefined);
  });

  it("subscribes and unsubscribes all mention count events", () => {
    for (const event of ["mention:new", "mention:state", "mention:read-all", "notification:new"]) {
      assert.ok(SOURCE.includes(`socket.on("${event}"`), `${event} is not subscribed`);
      assert.ok(SOURCE.includes(`socket.off("${event}"`), `${event} is never released`);
    }
  });

  it("refreshes mention totals only for mention notifications", () => {
    assert.equal(isMentionNotification({ type: "MENTION" }), true);
    assert.equal(isMentionNotification({ type: "DM" }), false);
    assert.equal(isMentionNotification({ type: "FRIEND_REQUEST" }), false);
  });
});
