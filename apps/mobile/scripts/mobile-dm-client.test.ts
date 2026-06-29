import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileDMMessagesPath,
  fetchMobileDMMessages,
  MOBILE_DM_MESSAGES_LIMIT,
} from "../src/dm/mobile-dm-client";
import type { MobileApiClient } from "../src/api/mobile-api-client";

const validResponse = {
  conversation: {
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-06-29T10:00:00.000Z",
    name: null,
    participants: [
      {
        avatarUrl: null,
        customStatus: null,
        displayName: "Alice",
        muted: false,
        presence: {
          customStatus: null,
          isOnline: true,
          lastSeenAt: null,
          status: "ONLINE",
        },
        status: "ONLINE",
        unreadCount: 0,
        userId: "user-2",
        username: "alice",
      },
    ],
    type: "DM",
  },
  messages: [
    {
      attachments: [],
      author: {
        avatarUrl: null,
        customStatus: null,
        displayName: "Alice",
        id: "user-2",
        status: "ONLINE",
        username: "alice",
      },
      content: "Hello from Whispr mobile.",
      conversationId: "conversation-1",
      createdAt: "2026-06-29T10:00:00.000Z",
      deletedAt: null,
      deletedById: null,
      editedAt: null,
      id: "message-1",
      reactions: [],
      replyTo: null,
      replyToId: null,
      threadParentId: null,
      userId: "user-2",
    },
  ],
  nextCursor: null,
};

describe("mobile DM client", () => {
  it("builds a bounded, encoded mobile DM messages endpoint path", () => {
    assert.equal(
      buildMobileDMMessagesPath({ conversationId: "dm/conversation 1", cursor: "cursor 2" }),
      `/api/v1/mobile/dm/dm%2Fconversation%201/messages?limit=${MOBILE_DM_MESSAGES_LIMIT}&cursor=cursor+2`,
    );
  });

  it("loads and validates the mobile DM messages response", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validResponse as TResponse;
      },
    };

    const response = await fetchMobileDMMessages(client, {
      conversationId: "conversation-1",
    });

    assert.deepEqual(requests, [
      `/api/v1/mobile/dm/conversation-1/messages?limit=${MOBILE_DM_MESSAGES_LIMIT}`,
    ]);
    assert.equal(response.conversation.id, "conversation-1");
    assert.equal(response.messages[0]?.content, "Hello from Whispr mobile.");
  });

  it("rejects malformed message payloads before the UI trusts them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          ...validResponse,
          messages: [
            {
              ...validResponse.messages[0],
              attachments: "not-an-array",
            },
          ],
        } as TResponse;
      },
    };

    await assert.rejects(
      () => fetchMobileDMMessages(client, { conversationId: "conversation-1" }),
      /Expected array/,
    );
  });
});
