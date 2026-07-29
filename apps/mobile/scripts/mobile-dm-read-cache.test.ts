import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import type { MobileDMConversationsResponse } from "@wizards/types";
import {
  patchMobileBootstrapDMRead,
  patchMobileDMConversationsRead,
  readMobileDMConversationUnreadCount,
} from "../src/query/mobile-dm-read-cache";

type ConversationsData = InfiniteData<MobileDMConversationsResponse, string | null>;

function buildConversation(
  id: string,
  unreadCount: number,
  mentionCount = 0,
): MobileDMConversationsResponse["conversations"][number] {
  return {
    iconUrl: null,
    id,
    lastMessage: null,
    lastMessageAt: "2026-07-28T09:00:00.000Z",
    mentionCount,
    muted: false,
    name: null,
    participantCount: 2,
    participants: [],
    type: "DM",
    unreadCount,
  };
}

function buildConversationsData(): ConversationsData {
  return {
    pageParams: [null, "cursor-1"],
    pages: [
      {
        conversations: [buildConversation("conversation-1", 3, 2), buildConversation("other", 1)],
        nextCursor: "cursor-1",
        totalUnreadCount: 4,
      },
      {
        conversations: [buildConversation("older", 0)],
        nextCursor: null,
        totalUnreadCount: 4,
      },
    ],
  };
}

describe("readMobileDMConversationUnreadCount", () => {
  it("reads the cached unread count for one conversation", () => {
    assert.equal(
      readMobileDMConversationUnreadCount(buildConversationsData(), "conversation-1"),
      3,
    );
  });

  it("reports zero for a conversation the cache has not seen", () => {
    assert.equal(readMobileDMConversationUnreadCount(buildConversationsData(), "missing"), 0);
    assert.equal(readMobileDMConversationUnreadCount(undefined, "conversation-1"), 0);
  });
});

describe("patchMobileDMConversationsRead", () => {
  it("zeroes the read conversation and lowers the inbox total on every page", () => {
    const { data, patched } = patchMobileDMConversationsRead(
      buildConversationsData(),
      "conversation-1",
    );

    assert.equal(patched, true);
    const read = data?.pages[0]?.conversations.find(
      (conversation) => conversation.id === "conversation-1",
    );
    assert.equal(read?.unreadCount, 0);
    assert.equal(read?.mentionCount, 0);
    assert.equal(data?.pages[0]?.conversations[1]?.unreadCount, 1);
    assert.equal(data?.pages[0]?.totalUnreadCount, 1);
    assert.equal(data?.pages[1]?.totalUnreadCount, 1);
  });

  it("never drives the inbox total below zero", () => {
    const source = buildConversationsData();
    const skewed: ConversationsData = {
      ...source,
      pages: source.pages.map((page) => ({ ...page, totalUnreadCount: 1 })),
    };

    const { data } = patchMobileDMConversationsRead(skewed, "conversation-1");

    assert.equal(data?.pages[0]?.totalUnreadCount, 0);
  });

  it("leaves the cache untouched for an unknown conversation", () => {
    const source = buildConversationsData();
    const { data, patched } = patchMobileDMConversationsRead(source, "missing");

    assert.equal(patched, false);
    assert.equal(data, source);
  });

  it("leaves an already-read conversation untouched", () => {
    const source = buildConversationsData();
    const { data, patched } = patchMobileDMConversationsRead(source, "older");

    assert.equal(patched, false);
    assert.equal(data, source);
  });

  it("passes an empty cache straight through", () => {
    const { data, patched } = patchMobileDMConversationsRead(undefined, "conversation-1");

    assert.equal(data, undefined);
    assert.equal(patched, false);
  });
});

describe("patchMobileBootstrapDMRead", () => {
  function buildBootstrapSlice() {
    return {
      home: {
        directMessages: {
          recent: [buildConversation("conversation-1", 3, 2), buildConversation("other", 1)],
          totalCount: 2,
          unreadCount: 4,
        },
      },
    };
  }

  it("zeroes the recent entry and lowers the badge count", () => {
    const { data, patched } = patchMobileBootstrapDMRead(buildBootstrapSlice(), {
      clearedCount: 3,
      conversationId: "conversation-1",
    });

    assert.equal(patched, true);
    assert.equal(data?.home.directMessages.unreadCount, 1);
    assert.equal(data?.home.directMessages.recent[0]?.unreadCount, 0);
    assert.equal(data?.home.directMessages.recent[0]?.mentionCount, 0);
    assert.equal(data?.home.directMessages.recent[1]?.unreadCount, 1);
  });

  it("never drives the badge count below zero", () => {
    const { data } = patchMobileBootstrapDMRead(buildBootstrapSlice(), {
      clearedCount: 99,
      conversationId: "conversation-1",
    });

    assert.equal(data?.home.directMessages.unreadCount, 0);
  });

  it("falls back to the recent entry's own unread count when the caller has none", () => {
    const { data, patched } = patchMobileBootstrapDMRead(buildBootstrapSlice(), {
      clearedCount: 0,
      conversationId: "conversation-1",
    });

    assert.equal(patched, true);
    assert.equal(data?.home.directMessages.unreadCount, 1);
    assert.equal(data?.home.directMessages.recent[0]?.unreadCount, 0);
  });

  it("leaves the payload untouched for a conversation it does not list", () => {
    const source = buildBootstrapSlice();
    const { data, patched } = patchMobileBootstrapDMRead(source, {
      clearedCount: 2,
      conversationId: "missing",
    });

    assert.equal(patched, false);
    assert.equal(data, source);
  });

  it("passes an empty payload straight through", () => {
    const { data, patched } = patchMobileBootstrapDMRead(undefined, {
      clearedCount: 1,
      conversationId: "conversation-1",
    });

    assert.equal(data, undefined);
    assert.equal(patched, false);
  });
});
