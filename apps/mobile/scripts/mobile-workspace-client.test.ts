import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import {
  buildMobileChannelMessagePath,
  buildMobileChannelMessageReactionPath,
  buildMobileChannelMessageThreadPath,
  buildMobileChannelMarkReadPath,
  buildMobileChannelMessagesPath,
  buildMobileChannelSendMessagePath,
  buildMobileWorkspaceServerPath,
  deleteMobileChannelMessage,
  fetchMobileChannelMessageThread,
  fetchMobileChannelMessages,
  fetchMobileWorkspaceServer,
  markMobileChannelRead,
  MOBILE_CHANNEL_MESSAGES_LIMIT,
  sendMobileChannelMessage,
  setMobileChannelMessageReaction,
  updateMobileChannelMessage,
} from "../src/workspace/mobile-workspace-client";

const validServerDetailResponse = {
  detail: {
    capabilities: {
      canClearHistory: false,
      canDeleteServer: false,
      canKickMembers: false,
      canManageChannels: true,
      canManageInvites: true,
      canManageRoles: false,
      canManageServer: true,
      canUploadServerIcon: true,
    },
    categories: [
      {
        channels: [
          {
            categoryId: "category-1",
            categoryName: "Lobby",
            id: "channel-1",
            locked: false,
            lastMessage: {
              author: {
                displayName: "Alice",
                id: "user-1",
                username: "alice",
              },
              createdAt: "2026-06-30T08:00:00.000Z",
              id: "message-1",
              text: "Hello from a real text channel.",
            },
            mentionCount: 0,
            name: "welcome",
            position: 0,
            readOnly: false,
            topic: "Welcome channel",
            type: "TEXT",
            unreadCount: 1,
          },
        ],
        id: "category-1",
        name: "Lobby",
        position: 0,
      },
    ],
    hasMoreChannels: false,
    server: {
      defaultChannelId: "channel-1",
      description: null,
      iconUrl: null,
      id: "server-1",
      memberCount: 3,
      mentionCount: 0,
      name: "Whispr UAT",
      shortName: "WU",
      unreadCount: 1,
      visibleChannelCount: 1,
    },
    ungroupedChannels: [],
  },
};

const validWorkspaceChannel = validServerDetailResponse.detail.categories[0]!.channels[0]!;

const validChannelMessagesResponse = {
  channel: validWorkspaceChannel,
  hasMore: false,
  messages: [
    {
      attachments: [],
      author: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Alice",
        id: "user-1",
        status: "ONLINE",
        username: "alice",
      },
      channelId: "channel-1",
      content: "Hello from a real text channel.",
      createdAt: "2026-06-30T08:00:00.000Z",
      deletedAt: null,
      deletedById: null,
      editedAt: null,
      id: "message-1",
      isPinned: false,
      mentionEveryone: false,
      placeholderExpiresAt: null,
      reactions: [],
      replyTo: null,
      threadParentId: null,
      threadSummary: {
        lastReplyAt: null,
        recentRepliers: [],
        replyCount: 0,
      },
      type: "DEFAULT",
    },
  ],
  nextCursor: null,
};

const validChannelThreadResponse = {
  hasMore: false,
  messages: validChannelMessagesResponse.messages,
  nextCursor: null,
  parent: validChannelMessagesResponse.messages[0],
};

describe("mobile workspace client", () => {
  it("builds an encoded mobile server detail endpoint path", () => {
    assert.equal(
      buildMobileWorkspaceServerPath({ serverId: "server/id 1" }),
      "/api/v1/mobile/servers/server%2Fid%201",
    );
  });

  it("builds a bounded, encoded mobile channel messages endpoint path", () => {
    assert.equal(
      buildMobileChannelMessagesPath({ channelId: "channel/id 1", cursor: "cursor 2" }),
      `/api/v1/mobile/channels/channel%2Fid%201/messages?limit=${MOBILE_CHANNEL_MESSAGES_LIMIT}&cursor=cursor+2`,
    );
  });

  it("builds an encoded mobile channel message send endpoint path", () => {
    assert.equal(
      buildMobileChannelSendMessagePath({ channelId: "channel/id 1" }),
      "/api/v1/mobile/channels/channel%2Fid%201/messages",
    );
  });

  it("builds encoded channel message action, reaction, and bounded thread paths", () => {
    const input = { channelId: "channel/id 1", messageId: "message/id 1" };

    assert.equal(
      buildMobileChannelMessagePath(input),
      "/api/v1/mobile/channels/channel%2Fid%201/messages/message%2Fid%201",
    );
    assert.equal(
      buildMobileChannelMessageReactionPath(input),
      "/api/v1/mobile/channels/channel%2Fid%201/messages/message%2Fid%201/reactions",
    );
    assert.equal(
      buildMobileChannelMessageThreadPath({ ...input, cursor: "cursor 2" }),
      `/api/v1/mobile/channels/channel%2Fid%201/messages/message%2Fid%201/thread?limit=${MOBILE_CHANNEL_MESSAGES_LIMIT}&cursor=cursor+2`,
    );
  });

  it("marks an accessible text channel read through the bearer-auth contract", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return {
          channelId: "channel-1",
          firstUnreadMessageId: null,
          mentionCount: 0,
          serverId: "server-1",
          serverMentionCount: 1,
          serverUnreadCount: 2,
          unreadCount: 0,
        } as TResponse;
      },
    };

    assert.equal(
      buildMobileChannelMarkReadPath({ channelId: "channel/id 1" }),
      "/api/v1/mobile/channels/channel%2Fid%201/read",
    );

    const response = await markMobileChannelRead(client, { channelId: "channel-1" });

    assert.deepEqual(requests, [
      {
        options: { method: "PATCH" },
        path: "/api/v1/mobile/channels/channel-1/read",
      },
    ]);
    assert.equal(response.serverUnreadCount, 2);
  });

  it("loads and validates a mobile workspace server detail response", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validServerDetailResponse as TResponse;
      },
    };

    const response = await fetchMobileWorkspaceServer(client, { serverId: "server-1" });

    assert.deepEqual(requests, ["/api/v1/mobile/servers/server-1"]);
    assert.equal(response.detail.server.id, "server-1");
    assert.equal(response.detail.categories[0]?.channels[0]?.name, "welcome");
    assert.equal(response.detail.capabilities.canManageInvites, true);
  });

  it("loads and validates a mobile channel messages response", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validChannelMessagesResponse as TResponse;
      },
    };

    const response = await fetchMobileChannelMessages(client, { channelId: "channel-1" });

    assert.deepEqual(requests, [
      `/api/v1/mobile/channels/channel-1/messages?limit=${MOBILE_CHANNEL_MESSAGES_LIMIT}`,
    ]);
    assert.equal(response.channel.id, "channel-1");
    assert.equal(response.messages[0]?.content, "Hello from a real text channel.");
  });

  it("sends and validates a mobile channel message through the real POST contract", async () => {
    const requests: Array<{
      body: unknown;
      method: string | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options: MobileApiRequestOptions = {}) {
        requests.push({
          body: options.body,
          method: options.method,
          path,
        });
        return { message: validChannelMessagesResponse.messages[0] } as TResponse;
      },
    };

    const response = await sendMobileChannelMessage(client, {
      channelId: "channel-1",
      content: "Hello from mobile.",
    });

    assert.deepEqual(requests, [
      {
        body: {
          content: "Hello from mobile.",
        },
        method: "POST",
        path: "/api/v1/mobile/channels/channel-1/messages",
      },
    ]);
    assert.equal(response.message.id, "message-1");
  });

  it("updates, deletes, reacts to, and loads a channel thread through validated action contracts", async () => {
    const requests: Array<{
      options: MobileApiRequestOptions | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });

        if (path.includes("/thread")) {
          return validChannelThreadResponse as TResponse;
        }
        if (options?.method === "DELETE" && path.endsWith("/reactions")) {
          return { reactions: [] } as TResponse;
        }
        if (options?.method === "PUT") {
          return {
            reactions: [{ count: 1, emoji: "thumbs-up", userIds: ["user-1"] }],
          } as TResponse;
        }
        if (options?.method === "PATCH") {
          return { message: validChannelMessagesResponse.messages[0] } as TResponse;
        }
        return { status: "removed" } as TResponse;
      },
    };

    const input = { channelId: "channel-1", messageId: "message-1" };
    const updated = await updateMobileChannelMessage(client, {
      ...input,
      content: "Updated from mobile.",
    });
    const reacted = await setMobileChannelMessageReaction(client, {
      ...input,
      emoji: "thumbs-up",
      shouldReact: true,
    });
    const unreacted = await setMobileChannelMessageReaction(client, {
      ...input,
      emoji: "thumbs-up",
      shouldReact: false,
    });
    const deleted = await deleteMobileChannelMessage(client, input);
    const thread = await fetchMobileChannelMessageThread(client, { ...input, cursor: "cursor-1" });

    assert.deepEqual(requests, [
      {
        options: { body: { content: "Updated from mobile." }, method: "PATCH" },
        path: "/api/v1/mobile/channels/channel-1/messages/message-1",
      },
      {
        options: { body: { emoji: "thumbs-up" }, method: "PUT" },
        path: "/api/v1/mobile/channels/channel-1/messages/message-1/reactions",
      },
      {
        options: { body: { emoji: "thumbs-up" }, method: "DELETE" },
        path: "/api/v1/mobile/channels/channel-1/messages/message-1/reactions",
      },
      {
        options: { method: "DELETE" },
        path: "/api/v1/mobile/channels/channel-1/messages/message-1",
      },
      {
        options: undefined,
        path: `/api/v1/mobile/channels/channel-1/messages/message-1/thread?limit=${MOBILE_CHANNEL_MESSAGES_LIMIT}&cursor=cursor-1`,
      },
    ]);
    assert.equal(updated.message.id, "message-1");
    assert.equal(reacted.reactions[0]?.count, 1);
    assert.deepEqual(unreacted.reactions, []);
    assert.equal(deleted.status, "removed");
    assert.equal(thread.parent.id, "message-1");
  });

  it("rejects malformed workspace server payloads before the UI trusts them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          detail: {
            ...validServerDetailResponse.detail,
            ungroupedChannels: "not-an-array",
          },
        } as TResponse;
      },
    };

    await assert.rejects(
      () => fetchMobileWorkspaceServer(client, { serverId: "server-1" }),
      /Expected array/,
    );
  });

  it("rejects malformed channel message payloads before the UI trusts them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          ...validChannelMessagesResponse,
          messages: [
            {
              ...validChannelMessagesResponse.messages[0],
              attachments: "not-an-array",
            },
          ],
        } as TResponse;
      },
    };

    await assert.rejects(
      () => fetchMobileChannelMessages(client, { channelId: "channel-1" }),
      /Expected array/,
    );
  });
});
