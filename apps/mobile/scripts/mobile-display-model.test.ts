import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChatMessage,
  MobileBootstrapPayload,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  findInitialMobileWorkspaceChannel,
  formatMobileDisplayTime,
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationTitle,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileWorkspaceChannels,
  isMobilePresenceActive,
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
});
