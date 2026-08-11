import assert from "node:assert/strict";
import { describe, it } from "node:test";

const social = import("./mobile-social");
const mobile = import("./mobile");

const friendUser = {
  avatarUrl: null,
  displayName: "Ada",
  id: "user-2",
  username: "ada",
};

/**
 * Every field this wave adds is defaulted, because a client update ships ahead
 * of the server deploy that fills them in. These tests pin the pre-M4A payload
 * shapes so a later edit cannot quietly turn one of them into a hard failure.
 */
describe("messaging redesign M4A schemas", () => {
  it("parses a friend payload from a server that has no activity join yet", async () => {
    const { MobileFriendSchema } = await social;

    assert.deepEqual(
      MobileFriendSchema.parse({
        ...friendUser,
        customStatus: null,
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
      }),
      {
        ...friendUser,
        // Faz 4: open to group invites is the default, so a payload from a
        // server that predates the column still means "pickable".
        allowsGroupInvites: true,
        customStatus: null,
        device: null,
        lastSeenAt: null,
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
        voiceRoom: null,
      },
    );
  });

  it("carries the 1b voice room and device once the server sends them", async () => {
    const { MobileFriendSchema } = await social;
    const parsed = MobileFriendSchema.parse({
      ...friendUser,
      customStatus: null,
      device: "MOBILE",
      presence: { customStatus: null, status: "ONLINE" },
      status: "ONLINE",
      voiceRoom: {
        channelId: "channel-1",
        channelName: "live-room",
        serverId: "server-1",
        serverName: "paycore",
      },
    });

    assert.equal(parsed.device, "MOBILE");
    assert.equal(parsed.voiceRoom?.serverName, "paycore");
    // Unknown device strings are a contract break, not something to coerce.
    assert.equal(
      MobileFriendSchema.safeParse({
        ...friendUser,
        customStatus: null,
        device: "WATCH",
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
      }).success,
      false,
    );
  });

  it("defaults the 1c request context on an un-redeployed server", async () => {
    const { MobileFriendRequestSchema } = await social;
    const parsed = MobileFriendRequestSchema.parse({
      createdAt: "2026-07-28T09:00:00.000Z",
      id: "request-1",
      receiver: friendUser,
      receiverId: friendUser.id,
      sender: { ...friendUser, id: "user-1", username: "dogukan" },
      senderId: "user-1",
      status: "PENDING",
      updatedAt: "2026-07-28T09:00:00.000Z",
    });

    assert.equal(parsed.mutualFriendCount, 0);
    assert.equal(parsed.mutualServerCount, 0);
    assert.equal(parsed.mutualServerName, null);
    assert.equal(parsed.viaUsername, null);
  });

  it("bounds the suggestion list and its limit", async () => {
    const {
      MOBILE_FRIEND_SUGGESTION_LIMIT,
      MobileFriendSuggestionSchema,
      MobileFriendSuggestionsQuerySchema,
      MobileFriendSuggestionsResponseSchema,
    } = await social;

    assert.deepEqual(MobileFriendSuggestionSchema.parse(friendUser), {
      ...friendUser,
      mutualFriendCount: 0,
      mutualServerCount: 0,
      mutualServerName: null,
    });
    assert.equal(
      MobileFriendSuggestionsQuerySchema.parse({}).limit,
      MOBILE_FRIEND_SUGGESTION_LIMIT,
    );
    assert.equal(MobileFriendSuggestionsQuerySchema.parse({ limit: "3" }).limit, 3);
    assert.equal(MobileFriendSuggestionsQuerySchema.safeParse({ limit: 999 }).success, false);
    assert.equal(
      MobileFriendSuggestionsResponseSchema.safeParse({
        suggestions: Array.from({ length: MOBILE_FRIEND_SUGGESTION_LIMIT + 1 }, () => friendUser),
      }).success,
      false,
    );
  });

  it("defaults the account appearance and keeps each update field independent", async () => {
    const {
      MOBILE_ACCOUNT_APPEARANCE_DEFAULT,
      MobileAccountAppearanceSchema,
      MobileAccountSettingsUpdateSchema,
    } = await social;

    assert.deepEqual(MobileAccountAppearanceSchema.parse({}), {
      messageCompact: false,
      messageFollowSystemFont: false,
      messageFontSize: "medium",
    });
    assert.deepEqual(MOBILE_ACCOUNT_APPEARANCE_DEFAULT, MobileAccountAppearanceSchema.parse({}));
    // An appearance-only write must not be forced to carry a privacy field.
    assert.deepEqual(MobileAccountSettingsUpdateSchema.parse({ messageFontSize: "xlarge" }), {
      messageFontSize: "xlarge",
    });
    assert.equal(MobileAccountSettingsUpdateSchema.safeParse({}).success, false);
    assert.equal(
      MobileAccountSettingsUpdateSchema.safeParse({ messageFontSize: "huge" }).success,
      false,
    );
  });

  it("defaults the 1a conversation row fields on an older DM payload", async () => {
    const { MobileDMConversationListItemSchema } = await mobile;
    const parsed = MobileDMConversationListItemSchema.parse({
      iconUrl: null,
      id: "dm-1",
      lastMessage: {
        author: { displayName: "Ada", id: "user-2", username: "ada" },
        authorIsCurrentUser: false,
        createdAt: "2026-07-28T09:00:00.000Z",
        id: "message-1",
        text: "Deploy tamam",
      },
      lastMessageAt: "2026-07-28T09:00:00.000Z",
      muted: false,
      name: null,
      participantCount: 2,
      participants: [
        { avatarUrl: null, displayName: "Ada", id: "user-2", status: "ONLINE", username: "ada" },
      ],
      type: "DM",
      unreadCount: 1,
    });

    assert.equal(parsed.mentionCount, 0);
    assert.equal(parsed.participants[0]?.isBot, false);
    assert.equal(parsed.lastMessage?.kind, "text");
    assert.equal(parsed.lastMessage?.durationSec, null);
    assert.equal(parsed.lastMessage?.deliveryStatus, null);
  });

  it('accepts the voice preview the 1a row renders as "Sesli mesaj · 0:42"', async () => {
    const { MobileDMConversationLastMessagePreviewSchema } = await mobile;
    const parsed = MobileDMConversationLastMessagePreviewSchema.parse({
      author: { displayName: "Maestro", id: "user-3", username: "maestro" },
      authorIsCurrentUser: true,
      createdAt: "2026-07-28T09:00:00.000Z",
      deliveryStatus: "read",
      durationSec: 42,
      id: "message-2",
      kind: "voice",
      text: "voice-message.m4a",
    });

    assert.equal(parsed.kind, "voice");
    assert.equal(parsed.durationSec, 42);
    assert.equal(parsed.deliveryStatus, "read");
    assert.equal(
      MobileDMConversationLastMessagePreviewSchema.safeParse({
        author: { displayName: null, id: "user-3", username: "maestro" },
        authorIsCurrentUser: true,
        createdAt: "2026-07-28T09:00:00.000Z",
        id: "message-2",
        kind: "sticker",
        text: "x",
      }).success,
      false,
    );
  });

  it("accepts an empty preview only for a group lifecycle row", async () => {
    const { MobileDMConversationLastMessagePreviewSchema } = await mobile;

    const parsed = MobileDMConversationLastMessagePreviewSchema.parse({
      author: { displayName: "Ada", id: "user-1", username: "ada" },
      authorIsCurrentUser: true,
      createdAt: "2026-08-08T09:00:00.000Z",
      id: "message-system-1",
      systemType: "MEMBER_LEFT",
      text: "",
    });

    assert.equal(parsed.systemType, "MEMBER_LEFT");
    assert.equal(parsed.text, "");
  });

  it("rejects localized system metadata attached to a nonempty preview", async () => {
    const { MobileDMConversationLastMessagePreviewSchema } = await mobile;

    assert.equal(
      MobileDMConversationLastMessagePreviewSchema.safeParse({
        author: { displayName: "Ada", id: "user-1", username: "ada" },
        authorIsCurrentUser: true,
        createdAt: "2026-08-08T09:00:00.000Z",
        id: "message-system-2",
        systemType: "MEMBER_LEFT",
        text: "Ada ayrıldı",
      }).success,
      false,
    );
  });
});
