import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { mobileDMMessagesGetRoute } from "./[conversationId]/messages/get-route-logic";

const now = "2026-07-17T08:00:00.000Z";
const message = {
  attachments: [],
  author: {
    avatarUrl: null,
    customStatus: null,
    displayName: "Ada",
    id: "user-1",
    status: "ONLINE" as const,
    username: "ada",
  },
  content: "Hello",
  conversationId: "conversation-1",
  createdAt: now,
  deletedAt: null,
  deletedById: null,
  editedAt: null,
  id: "message-1",
  reactions: [],
  replyTo: null,
  replyToId: null,
  threadParentId: null,
  userId: "user-1",
};
const conversation = {
  id: "conversation-1",
  lastMessage: message,
  lastMessageAt: now,
  name: null,
  participants: [
    {
      avatarUrl: null,
      customStatus: null,
      displayName: "Ada",
      muted: false,
      presence: { customStatus: null, status: "ONLINE" as const },
      status: "ONLINE" as const,
      unreadCount: 0,
      userId: "user-1",
      username: "ada",
    },
  ],
  type: "DM" as const,
};
const context = { params: Promise.resolve({ conversationId: "conversation-1" }) };

describe("mobile DM messages GET route logic", () => {
  it("does not list messages or read states when membership authorization fails", async () => {
    const calls: string[] = [];
    const response = await mobileDMMessagesGetRoute(
      new Request("https://whispr.test/dm/conversation-1/messages"),
      context,
      {
        authenticate: async () => {
          calls.push("authenticate");
          return "user-1";
        },
        authorizeConversation: async () => {
          calls.push("authorize");
          throw new ApiError("Forbidden", 403, "FORBIDDEN");
        },
        enforceRateLimit: async () => {
          calls.push("rate-limit");
        },
        listMessages: async () => {
          calls.push("list-messages");
          return { messages: [], nextCursor: null };
        },
        listParticipantReadStates: async () => {
          calls.push("list-read-states");
          return [];
        },
      },
    );

    assert.equal(response.status, 403);
    assert.deepEqual(calls, ["authenticate", "rate-limit", "authorize"]);
  });

  // Opening a DM used to stack three round trips in front of the read: session,
  // then rate limit, then membership. The last two only need the id the first one
  // resolved, so they go out together.
  it("starts the membership read while the rate-limit call is still in flight", async () => {
    const events: string[] = [];
    let releaseRateLimit: () => void = () => undefined;
    const rateLimitPending = new Promise<void>((resolve) => {
      releaseRateLimit = resolve;
    });

    const response = await mobileDMMessagesGetRoute(
      new Request("https://whispr.test/dm/conversation-1/messages"),
      context,
      {
        authenticate: async () => "user-1",
        authorizeConversation: async () => {
          events.push("authorize:start");
          releaseRateLimit();
          return conversation;
        },
        enforceRateLimit: async () => {
          events.push("rate-limit:start");
          await rateLimitPending;
        },
        listMessages: async () => ({ messages: [], nextCursor: null }),
        listParticipantReadStates: async () => [],
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(events, ["rate-limit:start", "authorize:start"]);
  });

  it("keeps reporting a throttled request as 429 when membership also fails", async () => {
    const response = await mobileDMMessagesGetRoute(
      new Request("https://whispr.test/dm/conversation-1/messages"),
      context,
      {
        authenticate: async () => "user-1",
        authorizeConversation: async () => {
          throw new ApiError("Forbidden", 403, "FORBIDDEN");
        },
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        listMessages: async () => ({ messages: [], nextCursor: null }),
        listParticipantReadStates: async () => [],
      },
    );

    assert.equal(response.status, 429);
  });

  it("maps ISO and null participant read states after successful authorization", async () => {
    const calls: string[] = [];
    let listInput: unknown = null;
    const response = await mobileDMMessagesGetRoute(
      new Request("https://whispr.test/dm/conversation-1/messages?cursor=cursor-1&limit=100"),
      context,
      {
        authenticate: async () => {
          calls.push("authenticate");
          return "user-1";
        },
        authorizeConversation: async () => {
          calls.push("authorize");
          return conversation;
        },
        enforceRateLimit: async () => {
          calls.push("rate-limit");
        },
        listMessages: async (input: unknown) => {
          calls.push("list-messages");
          listInput = input;
          return { messages: [message], nextCursor: null };
        },
        listParticipantReadStates: async () => {
          calls.push("list-read-states");
          return [
            { lastDeliveredAt: new Date(now), lastReadAt: new Date(now), userId: "user-1" },
            { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
          ];
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "authenticate",
      "rate-limit",
      "authorize",
      "list-messages",
      "list-read-states",
    ]);
    assert.deepEqual(listInput, {
      conversationId: "conversation-1",
      cursor: "cursor-1",
      limit: 30,
      userId: "user-1",
    });
    assert.deepEqual((await response.json()).participantReadStates, [
      { lastDeliveredAt: now, lastReadAt: now, userId: "user-1" },
      { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
    ]);
  });
});
