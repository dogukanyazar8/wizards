import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  ChatMessage,
  DMMessagePayload,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MobileVoiceStatesResponse,
} from "@wizards/types";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  createMobileRealtimeEventEnvelope,
  type MobileRealtimeServerEventName,
} from "../src/realtime/mobile-realtime-contract";
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
      lastMessage: null,
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

function makeWorkspaceWithLastMessage(channelId = "channel-1") {
  return {
    detail: {
      categories: [
        {
          channels: [
            {
              ...makeChannelPage([]).channel,
              id: channelId,
              lastMessage: {
                author: {
                  displayName: "Before",
                  id: "user-before",
                  username: "before",
                },
                createdAt: "2026-07-09T09:00:00.000Z",
                id: "message-before",
                text: "stale preview",
              },
            },
          ],
          id: "category-1",
          name: "General",
          position: 0,
        },
      ],
      ungroupedChannels: [],
    },
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
    participantReadStates: [{ lastReadAt: "2026-07-11T11:00:00.000Z", userId: "user-2" }],
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

function createBridge(
  queryClient: QueryClient,
  scheduler: MobileRealtimeQueryBridgeScheduler,
  activeServerId: string | null = "server-1",
) {
  return createMobileRealtimeQueryBridge({
    getActiveTargets: () => ({
      channelId: "channel-1",
      conversationId: "conversation-1",
      serverId: activeServerId,
      voiceChannelId: null,
    }),
    queryClient,
    scheduler,
  });
}

describe("mobile realtime query bridge", () => {
  it("exposes bounded root query keys for realtime cache patching", () => {
    assert.deepEqual(mobileQueryKeys.workspaceRoot(), ["mobile", "workspace"]);
    assert.deepEqual(mobileQueryKeys.channelMessagesRoot(), ["mobile", "channel-messages"]);
    assert.deepEqual(mobileQueryKeys.dmMessagesRoot(), ["mobile", "dm-messages"]);
    assert.deepEqual(mobileQueryKeys.notificationsRoot(), ["mobile", "notifications"]);
    assert.deepEqual(mobileQueryKeys.notifications("unread"), [
      "mobile",
      "notifications",
      "unread",
    ]);
  });

  it("debounces presence, notification, workspace, channel, and DM mappings by timer source", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const keys = [
      mobileQueryKeys.bootstrap(),
      mobileQueryKeys.notifications(),
      mobileQueryKeys.friends(),
      mobileQueryKeys.workspace("server-1"),
      mobileQueryKeys.channelMessages("channel-1"),
      mobileQueryKeys.dmMessages("conversation-1"),
    ] as const;
    keys.forEach((key) => queryClient.setQueryData(key, { ready: true }));

    bridge.handleEvent(createMobileRealtimeEventEnvelope("friends:updated", { userId: "user-2" }));
    bridge.handleEvent(createMobileRealtimeEventEnvelope("notification:new", { id: "notice-1" }));
    bridge.backfill(["workspace", "channel", "dm"]);

    assert.equal(fake.pendingCount(), 5);
    fake.flush();
    keys.forEach((key) => assert.equal(queryClient.getQueryState(key)?.isInvalidated, true));
  });

  it("refreshes the selected server summary when a text-channel message arrives without an open channel", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const workspaceKey = mobileQueryKeys.workspace("server-1");
    queryClient.setQueryData(workspaceKey, { detail: { channels: [] } });
    const bridge = createMobileRealtimeQueryBridge({
      getActiveTargets: () => ({
        channelId: null,
        conversationId: null,
        serverId: "server-1",
        voiceChannelId: null,
      }),
      queryClient,
      scheduler: fake.scheduler,
    });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("message:new", {
        channelId: "channel-1",
        id: "message-2",
        serverId: "server-1",
      }),
    );

    assert.equal(fake.pendingCount(), 0);
    assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);
  });

  it("refreshes an inactive server immediately from its user-room stale event", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const workspaceKey = mobileQueryKeys.workspace("server-2");
    const refreshedServerIds: string[] = [];
    queryClient.setQueryData(workspaceKey, makeWorkspaceWithLastMessage("channel-2"));
    const bridge = createMobileRealtimeQueryBridge({
      getActiveTargets: () => ({
        channelId: null,
        conversationId: null,
        serverId: "server-1",
        voiceChannelId: null,
      }),
      queryClient,
      refreshWorkspace: (serverId: string) => {
        refreshedServerIds.push(serverId);
        return Promise.resolve();
      },
      scheduler: fake.scheduler,
    } as Parameters<typeof createMobileRealtimeQueryBridge>[0]);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("channel:messages:stale" as MobileRealtimeServerEventName, {
        channelId: "channel-2",
        lastMessage: {
          author: {
            displayName: "Ada",
            id: "user-2",
            username: "ada",
          },
          createdAt: "2026-07-09T10:05:00.000Z",
          id: "message-2",
          text: "Immediate inactive-server preview",
        },
        latestMessageId: "message-2",
        serverId: "server-2",
      }),
    );

    assert.deepEqual(refreshedServerIds, ["server-2"]);
    assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);
    assert.equal(fake.pendingCount(), 0);
    assert.equal(
      queryClient.getQueryData<ReturnType<typeof makeWorkspaceWithLastMessage>>(workspaceKey)
        ?.detail.categories[0]?.channels[0]?.lastMessage?.text,
      "Immediate inactive-server preview",
    );
  });

  it("updates validated active-channel message pages without storing an unsafe fallback payload", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.channelMessages("channel-1");
    const workspaceKey = mobileQueryKeys.workspace("server-1");
    const initial: InfiniteData<MobileChannelMessagesResponse, string | null> = {
      pageParams: [null],
      pages: [makeChannelPage([makeMessage("message-1")])],
    };
    queryClient.setQueryData(key, initial);
    queryClient.setQueryData(workspaceKey, { detail: { channels: [] } });

    bridge.handleEvent(createMobileRealtimeEventEnvelope("message:new", makeMessage("message-2")));

    const updated =
      queryClient.getQueryData<InfiniteData<MobileChannelMessagesResponse, string | null>>(key);
    assert.deepEqual(
      updated?.pages[0]?.messages.map((message) => message.id),
      ["message-1", "message-2"],
    );
    assert.equal(fake.pendingCount(), 0);
    assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("message:new", {
        channelId: "channel-1",
        content: "unsafe-unvalidated-body",
      }),
    );
    assert.equal(fake.pendingCount(), 1);
  });

  it("patches the active server channel preview immediately from a validated socket message", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const workspaceKey = mobileQueryKeys.workspace("server-1");
    queryClient.setQueryData(workspaceKey, makeWorkspaceWithLastMessage());

    bridge.handleEvent(createMobileRealtimeEventEnvelope("message:new", makeMessage("message-2")));

    const updated =
      queryClient.getQueryData<ReturnType<typeof makeWorkspaceWithLastMessage>>(workspaceKey);
    assert.deepEqual(updated?.detail.categories[0]?.channels[0]?.lastMessage, {
      author: {
        displayName: "Dogukan",
        id: "user-1",
        username: "dogukan",
      },
      createdAt: "2026-07-09T10:00:00.000Z",
      id: "message-2",
      text: "redacted-test-message",
    });
    assert.equal(fake.pendingCount(), 0);
  });

  it("patches only the matching server voice-state cache for join and leave snapshots", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const matchingKey = mobileQueryKeys.voiceStates("server-1");
    const unrelatedKey = mobileQueryKeys.voiceStates("server-2");
    const matching: MobileVoiceStatesResponse = { states: [] };
    const unrelated: MobileVoiceStatesResponse = {
      states: [{ channelId: "voice-2", participants: [] }],
    };
    queryClient.setQueryData(matchingKey, matching);
    queryClient.setQueryData(unrelatedKey, unrelated);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("voice:state:update", {
        action: "join",
        channelId: "voice-1",
        participants: [
          {
            avatarUrl: null,
            displayName: "Ada",
            isScreenSharing: false,
            userId: "user-1",
            username: "ada",
          },
        ],
        serverId: "server-1",
        userId: "user-1",
      }),
    );

    assert.deepEqual(queryClient.getQueryData<MobileVoiceStatesResponse>(matchingKey), {
      states: [
        {
          channelId: "voice-1",
          participants: [
            {
              avatarUrl: null,
              displayName: "Ada",
              isScreenSharing: false,
              userId: "user-1",
              username: "ada",
            },
          ],
        },
      ],
    });
    assert.equal(queryClient.getQueryData(unrelatedKey), unrelated);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("voice:state:update", {
        action: "leave",
        channelId: "voice-1",
        participants: [],
        serverId: "server-1",
        userId: "user-1",
      }),
    );
    assert.deepEqual(queryClient.getQueryData<MobileVoiceStatesResponse>(matchingKey), {
      states: [],
    });
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
    assert.equal(fake.pendingCount(), 1);
  });

  it("patches authoritative participant read states from a DM read event", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.dmMessages("conversation-1");
    queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key, {
      pageParams: [null],
      pages: [makeDMPage([makeDMMessage("message-1")])],
    });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:read", {
        conversationId: "conversation-1",
        lastReadAt: "2026-07-17T08:05:00.000Z",
        userId: "user-2",
      }),
    );

    const updated =
      queryClient.getQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key);
    assert.deepEqual(updated?.pages[0]?.participantReadStates, [
      { lastReadAt: "2026-07-17T08:05:00.000Z", userId: "user-2" },
    ]);
    assert.equal(fake.pendingCount(), 0);
  });

  it("applies active DM reaction and removal events without broad refresh", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const key = mobileQueryKeys.dmMessages("conversation-1");
    queryClient.setQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key, {
      pageParams: [null],
      pages: [makeDMPage([makeDMMessage("message-1"), makeDMMessage("message-2")])],
    });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:message:reaction_updated", {
        messageId: "message-1",
        reactions: [{ count: 1, emoji: "heart", userIds: ["user-1"] }],
      }),
    );
    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:message:removed", {
        conversationId: "conversation-1",
        messageId: "message-2",
      }),
    );

    const updated =
      queryClient.getQueryData<InfiniteData<MobileDMMessagesResponse, string | null>>(key);
    assert.deepEqual(
      updated?.pages[0]?.messages.map((message) => message.id),
      ["message-1"],
    );
    assert.deepEqual(updated?.pages[0]?.messages[0]?.reactions, [
      { count: 1, emoji: "heart", userIds: ["user-1"] },
    ]);
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

  it("invalidates the paginated DM conversation cache for an inactive conversation update", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const conversationsKey = mobileQueryKeys.dmConversations();
    queryClient.setQueryData(conversationsKey, { pages: [] });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("dm:conversation:updated", {
        conversationId: "conversation-not-active",
      }),
    );

    assert.equal(fake.pendingCount(), 1);
    fake.flush();
    assert.equal(queryClient.getQueryState(conversationsKey)?.isInvalidated, true);
  });

  it("removes only the departed server and exact workspace cache", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const bootstrapKey = mobileQueryKeys.bootstrap();
    const departedWorkspaceKey = mobileQueryKeys.workspace("server-1");
    const unaffectedWorkspaceKey = mobileQueryKeys.workspace("server-2");
    const unaffectedWorkspace = { detail: { server: { id: "server-2" } } };

    queryClient.setQueryData(bootstrapKey, {
      home: {
        servers: {
          recent: [{ id: "server-1" }, { id: "server-2" }],
          totalCount: 2,
        },
      },
    });
    queryClient.setQueryData(departedWorkspaceKey, { detail: { server: { id: "server-1" } } });
    queryClient.setQueryData(unaffectedWorkspaceKey, unaffectedWorkspace);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("server:membership:removed", {
        reason: "left",
        serverId: "server-1",
      }),
    );

    assert.deepEqual(
      (
        queryClient.getQueryData<{ home: { servers: { recent: { id: string }[] } } }>(bootstrapKey)
          ?.home.servers.recent ?? []
      ).map((server) => server.id),
      ["server-2"],
    );
    assert.equal(queryClient.getQueryData(departedWorkspaceKey), undefined);
    assert.equal(queryClient.getQueryData(unaffectedWorkspaceKey), unaffectedWorkspace);
    assert.equal(fake.pendingCount(), 0);
  });

  it("invalidates the event server even when it is not the active workspace", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const bootstrapKey = mobileQueryKeys.bootstrap();
    const inactiveWorkspaceKey = mobileQueryKeys.workspace("server-inactive");
    const activeWorkspaceKey = mobileQueryKeys.workspace("server-1");
    queryClient.setQueryData(bootstrapKey, { ready: true });
    queryClient.setQueryData(inactiveWorkspaceKey, { ready: true });
    queryClient.setQueryData(activeWorkspaceKey, { ready: true });
    queryClient.setQueryData(mobileQueryKeys.workspaceMembers("server-1"), { ready: true });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("server:settings:updated", {
        serverId: "server-inactive",
      }),
    );

    assert.equal(queryClient.getQueryState(bootstrapKey)?.isInvalidated, true);
    assert.equal(fake.pendingCount(), 1);
    fake.flush();
    assert.equal(queryClient.getQueryState(inactiveWorkspaceKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(activeWorkspaceKey)?.isInvalidated, false);
    assert.equal(
      queryClient.getQueryState(mobileQueryKeys.workspaceMembers("server-1"))?.isInvalidated,
      false,
    );
  });

  it("patches matching workspace members under the workspace root", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const matchingKey = mobileQueryKeys.workspace("server-1");
    const unrelatedKey = mobileQueryKeys.workspace("server-2");
    const matching = {
      detail: {
        capabilities: { canManageServer: false },
        members: [
          {
            customStatus: null,
            status: "ONLINE",
            userId: "user-2",
          },
        ],
      },
    };
    const unrelated = {
      detail: {
        capabilities: { canManageServer: true },
        members: [
          {
            customStatus: "Busy",
            status: "DND",
            userId: "user-3",
          },
        ],
      },
    };
    queryClient.setQueryData(matchingKey, matching);
    queryClient.setQueryData(unrelatedKey, unrelated);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("presence:update", {
        customStatus: "Reviewing",
        status: "IDLE",
        userId: "user-2",
      }),
    );

    assert.equal(
      queryClient.getQueryData<typeof matching>(matchingKey)?.detail.members[0]?.status,
      "IDLE",
    );
    assert.equal(
      queryClient.getQueryData<typeof matching>(matchingKey)?.detail.capabilities,
      matching.detail.capabilities,
    );
    assert.equal(queryClient.getQueryData(unrelatedKey), unrelated);
  });

  it("uses one exact workspace timer for an active management event and member list", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const workspaceKey = mobileQueryKeys.workspace("server-1");
    const membersKey = mobileQueryKeys.workspaceMembers("server-1");
    const unrelatedWorkspaceKey = mobileQueryKeys.workspace("server-2");
    queryClient.setQueryData(workspaceKey, { ready: true });
    queryClient.setQueryData(membersKey, { ready: true });
    queryClient.setQueryData(unrelatedWorkspaceKey, { ready: true });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("server:settings:updated", { serverId: "server-1" }),
    );
    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("server:membership:added", { serverId: "server-1" }),
    );

    assert.equal(fake.pendingCount(), 1);
    fake.flush();
    assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(membersKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(unrelatedWorkspaceKey)?.isInvalidated, false);
  });

  it("refreshes friends, active members, and the live workspace count for a presence fallback", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const friendsKey = mobileQueryKeys.friends();
    const membersKey = mobileQueryKeys.workspaceMembers("server-1");
    const workspaceKey = mobileQueryKeys.workspace("server-1");
    const unrelatedMembersKey = mobileQueryKeys.workspaceMembers("server-2");
    queryClient.setQueryData(friendsKey, { friends: [] });
    queryClient.setQueryData(membersKey, { pages: [] });
    queryClient.setQueryData(workspaceKey, { detail: { members: [] } });
    queryClient.setQueryData(unrelatedMembersKey, { pages: [] });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("presence:update", {
        customStatus: null,
        status: "IDLE",
        userId: "not-cached-user",
      }),
    );

    assert.equal(fake.pendingCount(), 1);
    fake.flush();
    assert.equal(queryClient.getQueryState(friendsKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(membersKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(workspaceKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(unrelatedMembersKey)?.isInvalidated, false);
  });

  it("does not schedule member fallback without an active server", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler, null);
    const friendsKey = mobileQueryKeys.friends();
    const membersKey = mobileQueryKeys.workspaceMembers("server-1");
    queryClient.setQueryData(friendsKey, { friends: [] });
    queryClient.setQueryData(membersKey, { pages: [] });

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("presence:update", {
        customStatus: null,
        status: "IDLE",
        userId: "not-cached-user",
      }),
    );
    fake.flush();

    assert.equal(queryClient.getQueryState(friendsKey)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(membersKey)?.isInvalidated, false);
  });

  it("does not mutate or refresh malformed validated payloads and disposes narrow fallbacks", () => {
    const queryClient = new QueryClient();
    const fake = createFakeScheduler();
    const bridge = createBridge(queryClient, fake.scheduler);
    const bootstrapKey = mobileQueryKeys.bootstrap();
    const initialBootstrap = {
      home: { servers: { recent: [{ id: "server-2" }], totalCount: 1 } },
    };
    queryClient.setQueryData(bootstrapKey, initialBootstrap);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("presence:update", {
        customStatus: null,
        status: "NOT_A_STATUS",
        userId: "user-2",
      }),
    );
    assert.equal(queryClient.getQueryData(bootstrapKey), initialBootstrap);
    assert.equal(fake.pendingCount(), 0);

    bridge.handleEvent(
      createMobileRealtimeEventEnvelope("server:membership:removed", {
        reason: "left",
        serverId: "server-1",
      }),
    );
    assert.equal(fake.pendingCount(), 1);

    bridge.dispose();
    assert.equal(fake.pendingCount(), 0);
    fake.flush();
    assert.equal(queryClient.getQueryState(bootstrapKey)?.isInvalidated, false);
  });
});
