import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMobileDMConversationsPath,
  buildMobileDMMessagePath,
  buildMobileDMMessageReactionPath,
  buildMobileDMMessageThreadPath,
  buildMobileDMMarkReadPath,
  buildMobileDMSendMessagePath,
  buildMobileDMMessagesPath,
  deleteMobileDMMessage,
  fetchMobileDMMessageThread,
  fetchMobileDMMessages,
  fetchMobileDMConversations,
  getMobileDMReadTarget,
  markMobileDMConversationRead,
  MOBILE_DM_CONVERSATIONS_LIMIT,
  MOBILE_DM_MESSAGES_LIMIT,
  sendMobileDMMessage,
  setMobileDMMessageReaction,
  updateMobileDMMessage,
} from "../src/dm/mobile-dm-client";
import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";

const validResponse = {
  conversation: {
    iconUrl: null,
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-06-29T10:00:00.000Z",
    name: null,
    ownerId: null,
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

const validThreadResponse = {
  messages: validResponse.messages,
  nextCursor: null,
  parent: validResponse.messages[0],
};

const validConversationsResponse = {
  conversations: [
    {
      iconUrl: null,
      id: "conversation-1",
      lastMessage: {
        author: { displayName: "Alice", id: "user-2", username: "alice" },
        authorIsCurrentUser: false,
        createdAt: "2026-06-29T10:00:00.000Z",
        id: "message-1",
        text: "Hello from Whispr mobile.",
      },
      lastMessageAt: "2026-06-29T10:00:00.000Z",
      muted: false,
      name: null,
      participantCount: 1,
      participants: [
        {
          avatarUrl: null,
          displayName: "Alice",
          id: "user-2",
          status: "ONLINE",
          username: "alice",
        },
      ],
      type: "DM",
      unreadCount: 2,
    },
  ],
  nextCursor: "conversation-1",
  totalUnreadCount: 2,
};

describe("mobile DM client", () => {
  it("builds a bounded paginated mobile DM conversations path", () => {
    assert.equal(
      buildMobileDMConversationsPath({ cursor: "cursor 2" }),
      `/api/v1/mobile/dm?limit=${MOBILE_DM_CONVERSATIONS_LIMIT}&cursor=cursor+2`,
    );
  });

  it("loads and validates the typed mobile DM conversation cache payload", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validConversationsResponse as TResponse;
      },
    };

    const response = await fetchMobileDMConversations(client, { cursor: null });

    assert.deepEqual(requests, [`/api/v1/mobile/dm?limit=${MOBILE_DM_CONVERSATIONS_LIMIT}`]);
    assert.equal(response.conversations[0]?.lastMessage?.authorIsCurrentUser, false);
    assert.equal(response.conversations[0]?.unreadCount, 2);
  });

  it("builds a bounded, encoded mobile DM messages endpoint path", () => {
    assert.equal(
      buildMobileDMMessagesPath({ conversationId: "dm/conversation 1", cursor: "cursor 2" }),
      `/api/v1/mobile/dm/dm%2Fconversation%201/messages?limit=${MOBILE_DM_MESSAGES_LIMIT}&cursor=cursor+2`,
    );
  });

  it("builds an encoded mobile DM send endpoint path without list query state", () => {
    assert.equal(
      buildMobileDMSendMessagePath({ conversationId: "dm/conversation 1" }),
      "/api/v1/mobile/dm/dm%2Fconversation%201/messages",
    );
  });

  it("marks a DM conversation read through the bearer-auth mobile contract", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return {
          conversationId: "conversation-1",
          participantReadStates: [{ lastReadAt: "2026-07-17T08:05:00.000Z", userId: "user-1" }],
        } as TResponse;
      },
    };

    assert.equal(
      buildMobileDMMarkReadPath({ conversationId: "dm/conversation 1" }),
      "/api/v1/mobile/dm/dm%2Fconversation%201/read",
    );
    const response = await markMobileDMConversationRead(client, {
      conversationId: "conversation-1",
    });
    assert.deepEqual(requests, [
      {
        options: { method: "PATCH" },
        path: "/api/v1/mobile/dm/conversation-1/read",
      },
    ]);
    assert.equal(response.participantReadStates[0]?.userId, "user-1");
  });

  it("marks only a signed-in open conversation after a real message is visible", () => {
    assert.equal(
      getMobileDMReadTarget({
        conversationId: "conversation-1",
        isSignedIn: true,
        latestMessageId: "message-1",
      }),
      "conversation-1",
    );
    assert.equal(
      getMobileDMReadTarget({
        conversationId: "conversation-1",
        isSignedIn: false,
        latestMessageId: "message-1",
      }),
      null,
    );
    assert.equal(
      getMobileDMReadTarget({
        conversationId: "conversation-1",
        isSignedIn: true,
        latestMessageId: null,
      }),
      null,
    );
  });

  it("builds encoded DM message action, reaction, and bounded thread paths", () => {
    const input = { conversationId: "dm/conversation 1", messageId: "message/id 1" };

    assert.equal(
      buildMobileDMMessagePath(input),
      "/api/v1/mobile/dm/dm%2Fconversation%201/messages/message%2Fid%201",
    );
    assert.equal(
      buildMobileDMMessageReactionPath(input),
      "/api/v1/mobile/dm/dm%2Fconversation%201/messages/message%2Fid%201/reactions",
    );
    assert.equal(
      buildMobileDMMessageThreadPath({ ...input, cursor: "cursor 2" }),
      `/api/v1/mobile/dm/dm%2Fconversation%201/messages/message%2Fid%201/thread?limit=${MOBILE_DM_MESSAGES_LIMIT}&cursor=cursor+2`,
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

  it("sends a mobile DM message through the bounded POST endpoint", async () => {
    const requests: Array<{
      options: MobileApiRequestOptions | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return { message: validResponse.messages[0] } as TResponse;
      },
    };

    const response = await sendMobileDMMessage(client, {
      conversationId: "conversation-1",
      content: "Hello from mobile composer.",
    });

    assert.deepEqual(requests, [
      {
        path: "/api/v1/mobile/dm/conversation-1/messages",
        options: {
          body: {
            content: "Hello from mobile composer.",
          },
          method: "POST",
        },
      },
    ]);
    assert.equal(response.message.id, "message-1");
  });

  it("updates, deletes, reacts to, and loads a DM thread through validated action contracts", async () => {
    const requests: Array<{
      options: MobileApiRequestOptions | undefined;
      path: string;
    }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });

        if (path.includes("/thread")) {
          return validThreadResponse as TResponse;
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
          return { message: validResponse.messages[0] } as TResponse;
        }
        return { status: "removed" } as TResponse;
      },
    };

    const input = { conversationId: "conversation-1", messageId: "message-1" };
    const updated = await updateMobileDMMessage(client, {
      ...input,
      content: "Updated from mobile.",
    });
    const reacted = await setMobileDMMessageReaction(client, {
      ...input,
      emoji: "thumbs-up",
      shouldReact: true,
    });
    const unreacted = await setMobileDMMessageReaction(client, {
      ...input,
      emoji: "thumbs-up",
      shouldReact: false,
    });
    const deleted = await deleteMobileDMMessage(client, input);
    const thread = await fetchMobileDMMessageThread(client, { ...input, cursor: "cursor-1" });

    assert.deepEqual(requests, [
      {
        options: { body: { content: "Updated from mobile." }, method: "PATCH" },
        path: "/api/v1/mobile/dm/conversation-1/messages/message-1",
      },
      {
        options: { body: { emoji: "thumbs-up" }, method: "PUT" },
        path: "/api/v1/mobile/dm/conversation-1/messages/message-1/reactions",
      },
      {
        options: { body: { emoji: "thumbs-up" }, method: "DELETE" },
        path: "/api/v1/mobile/dm/conversation-1/messages/message-1/reactions",
      },
      {
        options: { method: "DELETE" },
        path: "/api/v1/mobile/dm/conversation-1/messages/message-1",
      },
      {
        options: undefined,
        path: `/api/v1/mobile/dm/conversation-1/messages/message-1/thread?limit=${MOBILE_DM_MESSAGES_LIMIT}&cursor=cursor-1`,
      },
    ]);
    assert.equal(updated.message.id, "message-1");
    assert.equal(reacted.reactions[0]?.count, 1);
    assert.deepEqual(unreacted.reactions, []);
    assert.equal(deleted.status, "removed");
    assert.equal(thread.parent.id, "message-1");
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

  it("rejects malformed send responses before the UI trusts them", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          message: {
            ...validResponse.messages[0],
            reactions: "not-an-array",
          },
        } as TResponse;
      },
    };

    await assert.rejects(
      () =>
        sendMobileDMMessage(client, {
          conversationId: "conversation-1",
          content: "Hello",
        }),
      /Expected array/,
    );
  });
});
