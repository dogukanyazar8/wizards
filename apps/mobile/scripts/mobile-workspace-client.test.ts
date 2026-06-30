import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MobileApiClient,
} from "../src/api/mobile-api-client";
import {
  buildMobileChannelMessagesPath,
  buildMobileWorkspaceServerPath,
  fetchMobileChannelMessages,
  fetchMobileWorkspaceServer,
  MOBILE_CHANNEL_MESSAGES_LIMIT,
} from "../src/workspace/mobile-workspace-client";

const validServerDetailResponse = {
  detail: {
    categories: [
      {
        channels: [
          {
            categoryId: "category-1",
            categoryName: "Lobby",
            id: "channel-1",
            locked: false,
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
