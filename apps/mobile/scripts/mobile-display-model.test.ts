import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChatMessage,
  MobileBootstrapPayload,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  filterMobileConversations,
  findInitialMobileWorkspaceChannel,
  formatMobileDisplayTime,
  getBoundedMobileList,
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationSearchText,
  getMobileConversationTitle,
  getMobileHomeQuickActions,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileMessageStreamItems,
  getMobileWorkspaceChannels,
  isMobilePresenceActive,
  MOBILE_RENDER_LIMITS,
} from "../src/app/mobile-display-model";

type Conversation =
  MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

const conversation: Conversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessageAt: "2026-06-30T09:00:00.000Z",
  muted: true,
  name: null,
  participantCount: 3,
  participants: [
    {
      avatarUrl: "https://cdn.whispr.team/alice.png",
      displayName: "Alice",
      id: "user-2",
      status: "ONLINE",
      username: "alice",
    },
    {
      avatarUrl: null,
      displayName: null,
      id: "user-3",
      status: "idle",
      username: "bob",
    },
    {
      avatarUrl: null,
      displayName: "Carol",
      id: "user-4",
      status: "OFFLINE",
      username: "carol",
    },
  ],
  type: "GROUP_DM",
  unreadCount: 2,
};

const workspaceDetail: MobileWorkspaceServerDetailResponse["detail"] = {
  categories: [
    {
      channels: [
        {
          categoryId: "category-1",
          categoryName: "Lobby",
          id: "voice-1",
          locked: false,
          mentionCount: 0,
          name: "voice",
          position: 1,
          readOnly: false,
          topic: null,
          type: "VOICE",
          unreadCount: 0,
        },
        {
          categoryId: "category-1",
          categoryName: "Lobby",
          id: "text-2",
          locked: true,
          mentionCount: 3,
          name: "alerts",
          position: 2,
          readOnly: true,
          topic: null,
          type: "TEXT",
          unreadCount: 4,
        },
      ],
      id: "category-1",
      name: "Lobby",
      position: 0,
    },
  ],
  hasMoreChannels: false,
  server: {
    defaultChannelId: "voice-1",
    description: null,
    iconUrl: null,
    id: "server-1",
    memberCount: 5,
    mentionCount: 3,
    name: "Whispr",
    shortName: "WH",
    unreadCount: 4,
    visibleChannelCount: 3,
  },
  ungroupedChannels: [
    {
      categoryId: null,
      categoryName: null,
      id: "text-1",
      locked: false,
      mentionCount: 0,
      name: "general",
      position: 0,
      readOnly: false,
      topic: "General",
      type: "TEXT",
      unreadCount: 0,
    },
  ],
};

const bootstrapPayload: MobileBootstrapPayload = {
  app: {
    buildId: "build-1",
    name: "Whispr",
    releaseChannel: "uat",
    serverTime: "2026-06-30T09:10:00.000Z",
    version: "0.8.15",
  },
  contracts: {
    deepLinks: ["auth-handoff", "invite", "route"],
    permissions: ["camera", "microphone", "notifications", "photoLibrary"],
  },
  features: {
    messages: {
      label: "Messages",
      status: "available",
    },
    nativeAuthTokenExchange: {
      label: "Native auth",
      status: "available",
    },
    pushNotifications: {
      label: "Push",
      reason: "Requires notification permission",
      status: "requires-native-permission",
    },
    voice: {
      label: "Voice",
      reason: "Native voice contract is not ready",
      status: "requires-server-contract",
    },
  },
  home: {
    directMessages: {
      recent: [conversation],
      totalCount: 1,
      unreadCount: 2,
    },
    servers: {
      recent: [
        {
          channelCount: 3,
          iconUrl: null,
          id: "server-1",
          joinedAt: "2026-06-30T08:00:00.000Z",
          memberCount: 5,
          name: "Whispr",
          shortName: "WH",
        },
      ],
      totalCount: 1,
    },
  },
  user: {
    avatarUrl: null,
    displayName: "Mobile User",
    id: "user-1",
    locale: "tr",
    status: "ONLINE",
    username: "mobile_user",
  },
};

const message: ChatMessage = {
  attachments: [],
  author: {
    avatarUrl: null,
    customStatus: null,
    displayName: "Alice",
    id: "user-2",
    status: "ONLINE",
    username: "alice",
  },
  channelId: "text-1",
  content: "  Hello mobile  ",
  createdAt: "2026-06-30T09:15:00.000Z",
  deletedAt: null,
  deletedById: null,
  editedAt: null,
  id: "message-1",
  reactions: [{ count: 2, emoji: "like", userIds: ["user-1", "user-2"] }],
  replyTo: null,
  type: "DEFAULT",
};

describe("mobile display model", () => {
  it("derives conversation display fields from real bootstrap data", () => {
    assert.equal(getMobileConversationTitle(conversation, "Direct message"), "Alice, bob, Carol");
    assert.equal(
      getMobileConversationAvatarUrl(conversation),
      "https://cdn.whispr.team/alice.png",
    );
    assert.equal(getMobileConversationActiveCount(conversation), 2);
    assert.equal(isMobilePresenceActive("DND"), true);
    assert.equal(isMobilePresenceActive("OFFLINE"), false);
  });

  it("filters conversation inbox using only real unread and group conversation data", () => {
    const quietConversation: Conversation = {
      ...conversation,
      id: "conversation-2",
      muted: false,
      name: "Project room",
      participants: [
        {
          avatarUrl: null,
          displayName: "Dora",
          id: "user-5",
          status: "OFFLINE",
          username: "dora",
        },
      ],
      type: "DM",
      unreadCount: 0,
    };
    const conversations = [conversation, quietConversation];

    assert.match(
      getMobileConversationSearchText(conversation, "Direct message"),
      /alice bob carol/,
    );
    assert.deepEqual(
      filterMobileConversations(conversations, {
        fallback: "Direct message",
        filter: "unread",
        query: "",
      }).map((item) => item.id),
      ["conversation-1"],
    );
    assert.deepEqual(
      filterMobileConversations(conversations, {
        fallback: "Direct message",
        filter: "groups",
        query: "",
      }).map((item) => item.id),
      ["conversation-1"],
    );
    assert.deepEqual(
      filterMobileConversations(conversations, {
        fallback: "Direct message",
        filter: "all",
        query: "project",
      }).map((item) => item.id),
      ["conversation-2"],
    );
  });

  it("formats messages without inventing content", () => {
    assert.equal(
      getMobileMessageBodyPreview(message, {
        attachmentOnly: "Attachment shared.",
        deleted: "Deleted.",
      }),
      "Hello mobile",
    );
    assert.deepEqual(getMobileMessageEngagementCounts(message), {
      attachmentCount: 0,
      reactionCount: 1,
    });
  });

  it("uses semantic fallbacks for deleted and attachment-only messages", () => {
    assert.equal(
      getMobileMessageBodyPreview(
        {
          ...message,
          content: "",
          deletedAt: "2026-06-30T09:16:00.000Z",
        },
        { attachmentOnly: "Attachment shared.", deleted: "Deleted." },
      ),
      "Deleted.",
    );
    assert.equal(
      getMobileMessageBodyPreview(
        {
          ...message,
          attachments: [
            {
              contentType: "image/png",
              filename: "real.png",
              height: 20,
              id: "attachment-1",
              size: 10,
              thumbnailUrl: null,
              url: "https://cdn.whispr.team/real.png",
              width: 20,
            },
          ],
          content: "",
        },
        { attachmentOnly: "Attachment shared.", deleted: "Deleted." },
      ),
      "Attachment shared.",
    );
  });

  it("keeps workspace channel selection text-first and bounded", () => {
    const channels = getMobileWorkspaceChannels(workspaceDetail);

    assert.deepEqual(
      channels.map((channel) => channel.id),
      ["text-1", "voice-1", "text-2"],
    );
    assert.equal(findInitialMobileWorkspaceChannel(workspaceDetail)?.id, "text-1");
    assert.deepEqual(getMobileChannelPriority(channels[2]!), {
      hasMentions: true,
      hasUnread: true,
      isLocked: true,
      isReadOnly: true,
    });
  });

  it("formats stable compact message times", () => {
    assert.match(formatMobileDisplayTime("2026-06-30T09:15:00.000Z"), /\d{2}:\d{2}/);
    assert.equal(formatMobileDisplayTime("not-a-date"), "");
  });

  it("bounds mobile list rendering without changing source ordering semantics", () => {
    const values = ["one", "two", "three", "four"];

    assert.deepEqual(getBoundedMobileList(values, 2), ["one", "two"]);
    assert.deepEqual(getBoundedMobileList(values, 2, "end"), ["three", "four"]);
    assert.deepEqual(getBoundedMobileList(values, 0), []);
    assert.equal(MOBILE_RENDER_LIMITS.messages > 0, true);
  });

  it("builds message stream rows with real timestamp separators", () => {
    const firstDayMessage: ChatMessage = {
      ...message,
      createdAt: "2026-06-30T09:15:00.000Z",
      id: "message-day-1",
    };
    const secondDayMessage: ChatMessage = {
      ...message,
      createdAt: "2026-07-01T09:15:00.000Z",
      id: "message-day-2",
    };
    const streamItems = getMobileMessageStreamItems([
      firstDayMessage,
      {
        ...firstDayMessage,
        createdAt: "2026-06-30T10:15:00.000Z",
        id: "message-day-1b",
      },
      secondDayMessage,
    ]);

    assert.deepEqual(
      streamItems.map((item) => [item.message.id, item.showDateSeparator]),
      [
        ["message-day-1", true],
        ["message-day-1b", false],
        ["message-day-2", true],
      ],
    );
  });

  it("builds bounded home quick actions from real bootstrap state", () => {
    const actions = getMobileHomeQuickActions(bootstrapPayload, {
      channelsSuffix: "channels",
      directMessageFallback: "Direct message",
      latestDirectMessage: "Latest conversation",
      latestServer: "Latest server",
      membersSuffix: "members",
      unreadSuffix: "unread",
    });

    assert.deepEqual(
      actions.map((action) => action.kind),
      ["direct-message", "server", "voice"],
    );
    assert.equal(actions[0]?.targetId, "conversation-1");
    assert.equal(actions[0]?.badge, 2);
    assert.equal(actions[1]?.targetId, "server-1");
    assert.equal(actions[1]?.subtitle, "5 members - 3 channels");
    assert.equal(actions[2]?.isEnabled, false);
  });
});
