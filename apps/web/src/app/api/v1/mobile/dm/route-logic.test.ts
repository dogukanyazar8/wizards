import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import {
  mobileDMCreateRoute,
  mobileDMListRoute,
  resolvePreviewDeliveryStatus,
} from "./route-logic";

describe("mobile DM create route", () => {
  it("returns a bearer-authenticated, bounded page with typed previews", async () => {
    const calls: unknown[] = [];
    const response = await mobileDMListRoute(
      new Request("https://whispr.test/api/v1/mobile/dm?cursor=dm-2&limit=20"),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id, action) => {
          calls.push(action);
        },
        listDMs: async (userId, input) => {
          calls.push({ input, userId });
          return {
            conversations: [
              {
                iconUrl: null,
                id: "dm-1",
                lastMessage: {
                  attachments: [],
                  author: {
                    avatarUrl: null,
                    customStatus: null,
                    displayName: "Ada",
                    id: "user-2",
                    status: "ONLINE",
                    username: "ada",
                  },
                  content: "  Hello\nworld  ",
                  conversationId: "dm-1",
                  createdAt: "2026-07-15T12:00:00.000Z",
                  deletedAt: null,
                  deletedById: null,
                  editedAt: null,
                  id: "message-1",
                  reactions: [],
                  replyTo: null,
                  replyToId: null,
                  systemTargetUserIds: [],
                  systemType: null,
                  systemValue: null,
                  threadParentId: null,
                  userId: "user-2",
                },
                lastMessageAt: "2026-07-15T12:00:00.000Z",
                name: null,
                ownerId: null,
                participants: [
                  {
                    avatarUrl: null,
                    customStatus: null,
                    displayName: "Ada",
                    muted: false,
                    presence: { customStatus: null, status: "ONLINE" },
                    status: "ONLINE",
                    unreadCount: 3,
                    userId: "user-2",
                    username: "ada",
                  },
                ],
                type: "DM",
              },
            ],
            nextCursor: null,
          };
        },
        getUnreadCount: async () => 7,
        loadConversationContext: async () => new Map(),
        recordDelivery: async (userId, conversationIds) => {
          calls.push({ delivered: conversationIds, userId });
          return [];
        },
      },
    );

    assert.equal(response.status, 200);
    // Reading the list is what marks these conversations delivered for the
    // viewer, which is the sender's second tick on the other device.
    assert.deepEqual(calls, [
      "mobile:dm:conversations:list",
      { input: { cursor: "dm-2", limit: 20 }, userId: "user-1" },
      { delivered: ["dm-1"], userId: "user-1" },
    ]);
    assert.deepEqual(await response.json(), {
      conversations: [
        {
          // Faz 3 §B3: the four group fields ride the row. A 1:1 conversation
          // carries their defaults rather than being a different shape.
          avatarPair: [],
          iconUrl: null,
          id: "dm-1",
          lastMessage: {
            author: { displayName: "Ada", id: "user-2", username: "ada" },
            authorIsCurrentUser: false,
            createdAt: "2026-07-15T12:00:00.000Z",
            deliveryStatus: null,
            durationSec: null,
            id: "message-1",
            kind: "text",
            systemTargetUserIds: [],
            systemType: null,
            systemValue: null,
            text: "Hello world",
          },
          lastMessageAt: "2026-07-15T12:00:00.000Z",
          mentionCount: 0,
          muted: false,
          name: null,
          notifyLevel: "ALL",
          overflowCount: 0,
          participantCount: 1,
          participants: [
            {
              avatarUrl: null,
              displayName: "Ada",
              id: "user-2",
              isBot: false,
              status: "ONLINE",
              username: "ada",
            },
          ],
          pinnedAt: null,
          type: "DM",
          unreadCount: 0,
        },
      ],
      nextCursor: null,
      totalUnreadCount: 7,
    });
  });

  it("carries the 1a row facts: mention badge, bot flag, voice preview and read ticks", async () => {
    const sentAt = "2026-07-15T12:00:00.000Z";
    const response = await mobileDMListRoute(new Request("https://whispr.test/api/v1/mobile/dm"), {
      authenticate: async () => "user-1",
      enforceRateLimit: async () => undefined,
      listDMs: async () => ({
        conversations: [
          {
            iconUrl: null,
            id: "dm-1",
            lastMessage: {
              attachments: [
                {
                  contentType: "audio/mp4",
                  duration: 42.4,
                  filename: "voice-message.m4a",
                  height: null,
                  id: "attachment-1",
                  size: 1024,
                  thumbnailUrl: null,
                  url: "https://cdn.test/voice.m4a",
                  userId: "user-1",
                  width: null,
                },
              ],
              author: {
                avatarUrl: null,
                customStatus: null,
                displayName: "Dogukan",
                id: "user-1",
                status: "ONLINE",
                username: "dogukan",
              },
              content: "",
              conversationId: "dm-1",
              createdAt: sentAt,
              deletedAt: null,
              deletedById: null,
              editedAt: null,
              id: "message-1",
              reactions: [],
              replyTo: null,
              replyToId: null,
              systemTargetUserIds: [],
              systemType: null,
              systemValue: null,
              threadParentId: null,
              userId: "user-1",
            },
            lastMessageAt: sentAt,
            name: null,
            ownerId: null,
            participants: [
              {
                avatarUrl: null,
                customStatus: null,
                displayName: "CodeX",
                muted: false,
                presence: { customStatus: null, status: "ONLINE" },
                status: "ONLINE",
                unreadCount: 0,
                userId: "bot-1",
                username: "codex",
              },
            ],
            type: "DM",
          },
        ],
        nextCursor: null,
      }),
      getUnreadCount: async () => 0,
      recordDelivery: async () => [],
      loadConversationContext: async (viewerId, conversationIds) => {
        assert.equal(viewerId, "user-1");
        assert.deepEqual(conversationIds, ["dm-1"]);
        return new Map([
          [
            "dm-1",
            {
              botUserIds: new Set(["bot-1"]),
              mentionCount: 3,
              othersLastDeliveredAt: new Date("2026-07-15T12:01:00.000Z"),
              // Read after the message was sent, so the row draws two accent ticks.
              othersLastReadAt: new Date("2026-07-15T12:05:00.000Z"),
            },
          ],
        ]);
      },
    });

    const body = (await response.json()) as {
      conversations: {
        lastMessage: { deliveryStatus: string; durationSec: number; kind: string };
        mentionCount: number;
        participants: { isBot: boolean }[];
      }[];
    };
    const conversation = body.conversations[0]!;
    assert.equal(conversation.mentionCount, 3);
    assert.equal(conversation.participants[0]!.isBot, true);
    assert.equal(conversation.lastMessage.kind, "voice");
    assert.equal(conversation.lastMessage.durationSec, 42);
    assert.equal(conversation.lastMessage.deliveryStatus, "read");
  });

  it("reports a single tick while nobody has read the viewer's last message", async () => {
    const response = await mobileDMListRoute(new Request("https://whispr.test/api/v1/mobile/dm"), {
      authenticate: async () => "user-1",
      enforceRateLimit: async () => undefined,
      listDMs: async () => ({
        conversations: [
          {
            iconUrl: null,
            id: "dm-1",
            lastMessage: {
              attachments: [],
              author: {
                avatarUrl: null,
                customStatus: null,
                displayName: "Dogukan",
                id: "user-1",
                status: "ONLINE",
                username: "dogukan",
              },
              content: "Deploy tamam",
              conversationId: "dm-1",
              createdAt: "2026-07-15T12:00:00.000Z",
              deletedAt: null,
              deletedById: null,
              editedAt: null,
              id: "message-1",
              reactions: [],
              replyTo: null,
              replyToId: null,
              systemTargetUserIds: [],
              systemType: null,
              systemValue: null,
              threadParentId: null,
              userId: "user-1",
            },
            lastMessageAt: "2026-07-15T12:00:00.000Z",
            name: null,
            ownerId: null,
            participants: [],
            type: "DM",
          },
        ],
        nextCursor: null,
      }),
      getUnreadCount: async () => 0,
      recordDelivery: async () => [],
      loadConversationContext: async () =>
        new Map([
          [
            "dm-1",
            {
              botUserIds: new Set<string>(),
              mentionCount: 0,
              othersLastDeliveredAt: null,
              othersLastReadAt: new Date("2026-07-15T11:00:00.000Z"),
            },
          ],
        ]),
    });

    const body = (await response.json()) as {
      conversations: { lastMessage: { deliveryStatus: string } }[];
    };
    assert.equal(body.conversations[0]!.lastMessage.deliveryStatus, "sent");
  });

  it("authenticates, rate limits, validates the target, and delegates authorization", async () => {
    const calls: string[] = [];
    const response = await mobileDMCreateRoute(
      new Request("https://whispr.test/dm", {
        body: JSON.stringify({ userId: "user-2" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async (_id, action) => {
          calls.push(action);
        },
        parseBody: parseJsonBody,
        createDM: async (userId, targetId) => {
          calls.push(`${userId}:${targetId}`);
          return {
            iconUrl: null,
            id: "dm-1",
            lastMessage: null,
            lastMessageAt: new Date().toISOString(),
            name: null,
            ownerId: null,
            participants: [
              {
                avatarUrl: null,
                customStatus: null,
                displayName: "Dogukan",
                muted: false,
                presence: { customStatus: null, status: "ONLINE" },
                status: "ONLINE",
                unreadCount: 0,
                userId,
                username: "dogukan",
              },
              {
                avatarUrl: null,
                customStatus: null,
                displayName: "Ada",
                muted: false,
                presence: { customStatus: null, status: "ONLINE" },
                status: "ONLINE",
                unreadCount: 0,
                userId: targetId,
                username: "ada",
              },
            ],
            type: "DM",
          };
        },
      },
    );
    assert.equal(response.status, 201);
    assert.deepEqual(calls, ["mobile:dm:create", "user-1:user-2"]);
  });
});

/**
 * §2 "1a".6.4. Three states, and the order between them matters: a client that
 * marked the conversation read has necessarily received the message, so a
 * delivery mark that lands afterwards must not pull the tick back.
 */
describe("mobile DM preview delivery status", () => {
  const sentAt = "2026-07-28T08:00:00.000Z";
  const before = new Date("2026-07-28T07:59:00.000Z");
  const after = new Date("2026-07-28T08:01:00.000Z");

  it("resolves sent, delivered and read against the message timestamp", () => {
    assert.equal(resolvePreviewDeliveryStatus(true, sentAt, null, null), "sent");
    assert.equal(resolvePreviewDeliveryStatus(true, sentAt, null, after), "delivered");
    assert.equal(resolvePreviewDeliveryStatus(true, sentAt, after, after), "read");
    // Marks that predate the message belong to an older one.
    assert.equal(resolvePreviewDeliveryStatus(true, sentAt, before, before), "sent");
  });

  it("prefers read over a stale delivery mark and draws nothing for an incoming row", () => {
    assert.equal(resolvePreviewDeliveryStatus(true, sentAt, after, before), "read");
    assert.equal(resolvePreviewDeliveryStatus(false, sentAt, after, after), null);
  });
});

describe("mobile DM list preview of a group lifecycle row", () => {
  it("sends an empty text and the system type instead of labelling it an attachment", async () => {
    const response = await mobileDMListRoute(new Request("https://whispr.test/api/v1/mobile/dm"), {
      authenticate: async () => "user-1",
      enforceRateLimit: async () => {},
      getUnreadCount: async () => 0,
      listDMs: async () => ({
        conversations: [
          {
            iconUrl: null,
            id: "group-1",
            lastMessage: {
              attachments: [],
              author: {
                avatarUrl: null,
                customStatus: null,
                displayName: "Ada",
                id: "user-2",
                status: "ONLINE",
                username: "ada",
              },
              // A system row: no text of its own, and no attachment to fall
              // back to. The old code answered "Attachment" here.
              content: "",
              conversationId: "group-1",
              createdAt: "2026-08-08T12:00:00.000Z",
              deletedAt: null,
              deletedById: null,
              editedAt: null,
              id: "message-1",
              reactions: [],
              replyTo: null,
              replyToId: null,
              systemTargetUserIds: ["user-3"],
              systemType: "MEMBER_ADDED",
              systemValue: null,
              threadParentId: null,
              userId: "user-2",
            },
            lastMessageAt: "2026-08-08T12:00:00.000Z",
            name: "Takım",
            ownerId: "user-2",
            participants: [],
            type: "GROUP_DM",
          },
        ],
        nextCursor: null,
      }),
      loadConversationContext: async () => new Map(),
      recordDelivery: async () => [],
    } as never);

    const body = (await response.json()) as {
      conversations: Array<{
        lastMessage: {
          systemTargetUserIds: string[];
          systemType: string | null;
          text: string;
        };
      }>;
    };
    const preview = body.conversations[0]!.lastMessage;

    assert.equal(preview.text, "");
    assert.equal(preview.systemType, "MEMBER_ADDED");
    assert.deepEqual(preview.systemTargetUserIds, ["user-3"]);
  });
});
