import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import type { MobileDMConversationsResponse } from "@wizards/types";
import {
  flattenMobileDMConversationPages,
  getMobileDMUnreadCount,
} from "../src/query/mobile-dm-conversations-query";

const conversation = (id: string, unreadCount: number) => ({
  iconUrl: null,
  id,
  lastMessage: null,
  lastMessageAt: "2026-07-15T12:00:00.000Z",
  muted: false,
  name: null,
  participantCount: 1,
  participants: [],
  type: "DM" as const,
  unreadCount,
});

describe("mobile DM conversations query", () => {
  it("deduplicates pages before deriving the typed unread badge count", () => {
    const data: InfiniteData<MobileDMConversationsResponse, string | null> = {
      pageParams: [null, "dm-2"],
      pages: [
        { conversations: [conversation("dm-1", 3), conversation("dm-2", 1)], nextCursor: "dm-2", totalUnreadCount: 9 },
        { conversations: [conversation("dm-2", 1), conversation("dm-3", 2)], nextCursor: null, totalUnreadCount: 9 },
      ],
    };

    assert.deepEqual(flattenMobileDMConversationPages(data).map((item) => item.id), [
      "dm-1",
      "dm-2",
      "dm-3",
    ]);
    assert.equal(getMobileDMUnreadCount({
      ...data,
      pages: data.pages.map((page) => ({ ...page, totalUnreadCount: 9 })),
    }), 9);
  });
});
