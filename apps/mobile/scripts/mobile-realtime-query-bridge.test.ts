import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  ChatMessage,
  DMMessagePayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
} from "@wizards/types";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { createMobileRealtimeEventEnvelope } from "../src/realtime/mobile-realtime-contract";
import {
  createMobileRealtimeQueryBridge,
  type MobileRealtimeQueryBridgeScheduler,
} from "../src/realtime/realtime-query-bridge";

function makeMessage(id: string): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Dogukan",
      id: "user-1",
      status: "ONLINE",
      username: "dogukan",
    },
    channelId: "channel-1",
    content: "redacted-test-message",
    createdAt: "2026-07-09T10:00:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
  };
}

function makeChannelPage(messages: ChatMessage[]): MobileChannelMessagesResponse {
  return {
    channel: {
      categoryId: null,
      categoryName: null,
      id: "channel-1",
      locked: false,
      mentionCount: 0,
      name: "development",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 0,
    },
    hasMore: false,
    messages,
    nextCursor: null,
  };
}

function makeDMMessage(id: string): DMMessagePayload {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: "Ada",
      id: "user-1",
      status: "ONLINE",
      username: "ada",
    },
    content: "redacted-dm-message",
    conversationId: "conversation-1",
    createdAt: "2026-07-11T12:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id,
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
    userId: "user-1",
  };
}

function makeDMPage(messages: DMMessagePayload[]): MobileDMMessagesResponse {
  return {
    conversation: {
      id: "conversation-1",
      lastMessage: null,
      lastMessageAt: "2026-07-11T12:00:00.000Z",
      name: null,
      participants: [],
      type: "DM",
    },
    messages,
    nextCursor: null,
  };
}

function createFakeScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const scheduler: MobileRealtimeQueryBridgeScheduler = {
    clearTimeout(timer) {
      callbacks.delete(timer as number);
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
  };

  return {
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
    pendingCount() {
      return callbacks.size;
    },
    scheduler,
  };
}

function createBridge(queryClient: QueryClient, scheduler: MobileRealtimeQueryBridgeScheduler) {
  return createMobileRealtimeQueryBridge({
    getActiveTargets: () => ({
      channelId: "channel-1",
      conversationId: "conversation-1",
      serverId: "server-1",
      voiceChannelId: null,
    }),
    queryClient,
    scheduler,
  });
}

describe("mobile realtime query bridge", () => {
  it("debounces presence, notification, workspace, channel, and DM mappings by timer source", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const keys = [
      mobileQueryKeys.bootstrap(),
      mobileQueryKeys.workspace("server-1"),
      mobileQueryKeys.channelMessages("channel-1"),
      mobileQueryKeys.dmMessages("conversation-1"),
    ] as const;
    keys.forEach((key) => queryClient.setQueryData(key, { ready: true }));

    bridge.handleEvent(createMobileRealtimeEventEnvelope("presence:update", { userId: "user-2" }));
    bridge.handleEvent(createMobileRealtimeEventEnvelope("notification:new", { id: "notice-1" }));
    bridge.backfill(["workspace", "channel", "dm"]);

    assert.equal(fake.pendingCount(), 4);
    fake.flush();
    keys.forEach((key) => assert.equal(queryClient.getQueryState(key)?.isInvalidated, true));
  });

  it("updates validated active-channel message pages without storing an unsafe fallback payload", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.channelMessages("channel-1");
    const initial: InfiniteData<MobileChannelMessagesResponse, string | null> = {
      pageParams: [null],
      pages: [makeChannelPage([makeMessage("message-1")])],
    };
    queryClient.setQueryData(key, initial);

    bridge.handleEvent(createMobileRealtimeEventEnvelope("message:new", makeMessage("message-2")));

    const updated =
      queryClient.getQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(key);
    assert.deepEqual(
      updated?.pages[0]?.messages.map((message) => message.id),
      ["message-1", "message-2"],
    );
    assert.equal(fake.pendingCount(), 0);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("message:new", {
        channelId: "channel-1",
        content: "unsafe-unvalidated-body",
      }),
    );
    assert.equal(fake.pendingCount(), 1);
  });

  it("updates validated active DM message pages without scheduling a refresh", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.dmMessages("conversation-1");
    queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key, {
      pageParams: [null],
      pages: [makeDMPage([makeDMMessage("message-1")])],
    });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:message:new", makeDMMessage("message-2")),
    );

    const updated =
      queryClient.getQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key);
    assert.deepEqual(
      updated?.pages[0]?.messages.map((message) => message.id),
      ["message-1", "message-2"],
    );
    assert.equal(fake.pendingCount(), 0);
  });

  it("invalidates DM events and clears every pending timer on dispose", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.dmMessages("conversation-1");
    queryClient.setQueryData(key, { ready: true });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:message:new", {
        conversationId: "conversation-1",
        content: "not-retained-by-envelope",
      }),
    );
    assert.equal(fake.pendingCount(), 1);

    bridge.dispose();
    assert.equal(fake.pendingCount(), 0);
    fake.flush();
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, false);
  });
});
