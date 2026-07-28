import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileCopy } from "../src/locale/mobile-copy";
import type {
  ChatMessage,
  MobileBootstrapPayload,
  MobileWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  filterMobileConversations,
  filterMobileWorkspaceChannelSections,
  findInitialMobileWorkspaceChannel,
  formatMobileDisplayTime,
  formatMobileUnreadCount,
  MOBILE_UNREAD_DISPLAY_CAP,
  getBoundedMobileList,
  getMobileChannelChatSearchVisibility,
  getMobileChannelPriority,
  getMobileChannelChatHeaderModel,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationSearchText,
  getMobileConversationTitle,
  getMobileHomeQuickActions,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileMessageListPerformanceConfig,
  getMobileMessageStreamItems,
  getMobileVoiceChannelScreenModel,
  getMobileWorkspaceChannelSurface,
  getMobileWorkspaceChannelSections,
  getMobileWorkspaceChannels,
  getVisibleMobileWorkspaceChannelSections,
  isMobilePresenceActive,
  MOBILE_RENDER_LIMITS,
  resolveMobileWorkspaceActiveTextChannelId,
  resolveMobileTabActiveTextChannelId,
} from "../src/app/mobile-display-model";

type Conversation = MobileBootstrapPayload["home"]["directMessages"]["recent"][number];

const conversation: Conversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessageAt: "2026-06-30T09:00:00.000Z",
  mentionCount: 0,
  muted: true,
  name: null,
  participantCount: 3,
  participants: [
    {
      avatarUrl: "https://cdn.whispr.team/alice.png",
      displayName: "Alice",
      id: "user-2",
      isBot: false,
      status: "ONLINE",
      username: "alice",
    },
    {
      avatarUrl: null,
      displayName: null,
      id: "user-3",
      isBot: false,
      status: "idle",
      username: "bob",
    },
    {
      avatarUrl: null,
      displayName: "Carol",
      id: "user-4",
      isBot: false,
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
          lastMessage: null,
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
          lastMessage: null,
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
  members: [
    {
      accessLevel: "MEMBER",
      avatarUrl: null,
      customStatus: null,
      displayName: "Alice",
      id: "member-1",
      roles: [],
      status: "ONLINE",
      userId: "user-2",
      username: "alice",
    },
  ],
  server: {
    allowFileUploads: true,
    allowGifs: true,
    defaultChannelId: "voice-1",
    description: null,
    iconUrl: null,
    id: "server-1",
    memberCount: 5,
    mentionCount: 3,
    name: "Whispr",
    onlineMemberCount: 1,
    ownerUserId: null,
    shortName: "WH",
    unreadCount: 4,
    visibleChannelCount: 3,
  },
  ungroupedChannels: [
    {
      categoryId: null,
      categoryName: null,
      id: "text-1",
      lastMessage: null,
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
    permissions: ["camera", "microphone", "notifications", "photoLibrary", "screenCapture"],
  },
  features: {
    attachments: {
      label: "Attachments",
      reason: "Mobile upload transport is not ready",
      status: "requires-server-contract",
    },
    invites: {
      label: "Invites",
      reason: "Mobile invite acceptance endpoint is not ready",
      status: "requires-server-contract",
    },
    messageSearch: {
      label: "Message search",
      reason: "Mobile search endpoints are ready",
      status: "available",
    },
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
  flags: {},
  isAdmin: false,
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
          mentionCount: 3,
          name: "Whispr",
          shortName: "WH",
          unreadCount: 4,
        },
      ],
      totalCount: 1,
    },
  },
  user: {
    avatarUrl: null,
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
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
  it("opens voice channels as a dedicated voice room surface when explicitly selected", () => {
    const voiceChannel = getMobileWorkspaceChannels(workspaceDetail).find(
      (channel) => channel.id === "voice-1",
    );

    assert.equal(
      getMobileWorkspaceChannelSurface(voiceChannel ?? null, {
        isExplicitlyOpened: true,
      }),
      "voice-room",
    );
  });

  it("builds a bounded voice channel screen model from real room participants", () => {
    const model = getMobileVoiceChannelScreenModel(
      {
        availableAudioInputs: [],
        availableAudioOutputs: [],
        cameraFacingMode: "user",
        channelId: "voice-1",
        channelName: "live-room",
        connectedAt: 1,
        errorMessage: null,
        noiseSuppressionEnabled: true,
        participants: [
          {
            audioLevel: 0.72,
            avatarUrl: null,
            displayName: "Dogukan",
            isCameraEnabled: false,
            isMuted: false,
            isScreenSharing: false,
            isSelf: true,
            isSpeaking: true,
            userId: "user-1",
            username: "dogukanyazar",
          },
          {
            audioLevel: 0,
            avatarUrl: null,
            displayName: "Mehmet",
            isCameraEnabled: false,
            isMuted: true,
            isScreenSharing: false,
            isSelf: false,
            isSpeaking: false,
            userId: "user-2",
            username: "mehmet",
          },
        ],
        screenShareStatus: "unsupported",
        selectedAudioInputId: null,
        selectedAudioOutputId: null,
        selfAudioOutput: "default",
        selfCameraEnabled: false,
        selfMuted: false,
        selfScreenShareEnabled: false,
        serverId: "server-1",
        sessionId: "session-1",
        status: "connected",
        updatedAt: 1,
      },
      {
        channelName: "live-room",
        locale: "tr",
        memberCount: 5,
        serverName: "UAT ENV",
        serverShortName: "UA",
      },
    );

    assert.equal(model.title, mobileCopy.tr.voiceRoomLiveTitle);
    assert.equal(model.qualityLabel, mobileCopy.tr.voiceRoomQualityConnected);
    assert.equal(model.signalLabel, mobileCopy.tr.voiceRoomSignalActive);
    assert.equal(model.serverName, "UAT ENV");
    assert.equal(model.channelName, "live-room");
    assert.equal(model.speakingParticipants.length, 1);
    assert.equal(model.listeningParticipants.length, 1);
    assert.equal(model.shouldSplitParticipantsBySpeakingState, false);
    assert.equal(model.participantCountLabel, "2");
    assert.equal(model.canLeave, true);
    assert.equal(model.canToggleCamera, true);
    assert.equal(model.canToggleMicrophone, true);
    assert.equal(model.canShareScreen, true);
    assert.equal(model.canOpenSettings, true);
  });

  it("localizes the mobile voice noise suppression label", () => {
    const englishModel = getMobileVoiceChannelScreenModel(
      {
        availableAudioInputs: [],
        availableAudioOutputs: [],
        cameraFacingMode: "user",
        channelId: "voice-1",
        channelName: "live-room",
        connectedAt: 1,
        errorMessage: null,
        noiseSuppressionEnabled: true,
        participants: [],
        screenShareStatus: "off",
        selectedAudioInputId: null,
        selectedAudioOutputId: null,
        selfAudioOutput: "default",
        selfCameraEnabled: false,
        selfMuted: false,
        selfScreenShareEnabled: false,
        serverId: "server-1",
        sessionId: "session-1",
        status: "connected",
        updatedAt: 1,
      },
      {
        channelName: "live-room",
        locale: "en",
        memberCount: 5,
        serverName: "UAT ENV",
        serverShortName: "UA",
      },
    );

    assert.equal(englishModel.noiseSuppressionLabel, "Noise suppression active");
  });

  it("derives conversation display fields from real bootstrap data", () => {
    assert.equal(getMobileConversationTitle(conversation, "Direct message"), "Alice, bob, Carol");
    assert.equal(getMobileConversationAvatarUrl(conversation), "https://cdn.whispr.team/alice.png");
    assert.equal(getMobileConversationActiveCount(conversation), 2);
    assert.equal(isMobilePresenceActive("DND"), true);
    assert.equal(isMobilePresenceActive("OFFLINE"), false);
  });

  it("never shows the viewer's own identity in a counterpart conversation slot", () => {
    // The API returns every participant, the viewer first (joinedAt asc), so an
    // avatar-less counterpart used to fall through to the viewer's own photo.
    const directConversation: Conversation = {
      ...conversation,
      id: "conversation-dm",
      participantCount: 2,
      participants: [
        {
          avatarUrl: "https://cdn.whispr.team/self.png",
          displayName: null,
          id: "user-self",
          isBot: false,
          status: "ONLINE",
          username: "dogukanyazar",
        },
        {
          avatarUrl: null,
          displayName: null,
          id: "user-ogi",
          isBot: false,
          status: "OFFLINE",
          username: "ogi_uat",
        },
      ],
      type: "DM",
    };

    assert.equal(getMobileConversationAvatarUrl(directConversation, "user-self"), null);
    assert.equal(
      getMobileConversationTitle(directConversation, "Direct message", "user-self"),
      "ogi_uat",
    );
    assert.equal(
      getMobileConversationInitialsLabel(directConversation, "Direct message", "user-self"),
      "ogi_uat",
    );

    const withCounterpartAvatar: Conversation = {
      ...directConversation,
      participants: [
        directConversation.participants[0]!,
        { ...directConversation.participants[1]!, avatarUrl: "https://cdn.whispr.team/ogi.png" },
      ],
    };

    assert.equal(
      getMobileConversationAvatarUrl(withCounterpartAvatar, "user-self"),
      "https://cdn.whispr.team/ogi.png",
    );
  });

  it("keeps the viewer's own avatar when the viewer is the only participant", () => {
    const selfConversation: Conversation = {
      ...conversation,
      id: "conversation-self",
      participantCount: 1,
      participants: [
        {
          avatarUrl: "https://cdn.whispr.team/self.png",
          displayName: "Me",
          id: "user-self",
          isBot: false,
          status: "ONLINE",
          username: "dogukanyazar",
        },
      ],
      type: "DM",
    };

    assert.equal(
      getMobileConversationAvatarUrl(selfConversation, "user-self"),
      "https://cdn.whispr.team/self.png",
    );
    assert.equal(getMobileConversationTitle(selfConversation, "Direct message", "user-self"), "Me");
  });

  it("keeps the group icon ahead of every participant avatar", () => {
    const groupConversation: Conversation = {
      ...conversation,
      iconUrl: "https://cdn.whispr.team/group.png",
    };

    assert.equal(
      getMobileConversationAvatarUrl(groupConversation, "user-2"),
      "https://cdn.whispr.team/group.png",
    );
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
          isBot: false,
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

  it("activates a valid preferred text channel only for an explicit stack route", () => {
    assert.equal(
      resolveMobileWorkspaceActiveTextChannelId(workspaceDetail, {
        currentChannelId: null,
        preferredChannelId: "text-2",
        shouldOpenPreferredChannel: true,
      }),
      "text-2",
    );
    assert.equal(
      resolveMobileWorkspaceActiveTextChannelId(workspaceDetail, {
        currentChannelId: null,
        preferredChannelId: "text-2",
        shouldOpenPreferredChannel: false,
      }),
      null,
    );
    assert.equal(
      resolveMobileWorkspaceActiveTextChannelId(workspaceDetail, {
        currentChannelId: "text-1",
        preferredChannelId: "voice-1",
        shouldOpenPreferredChannel: true,
      }),
      null,
    );
  });

  it("opens only explicitly entered text channels as a dedicated mobile chat screen", () => {
    const channels = getMobileWorkspaceChannels(workspaceDetail);

    assert.equal(
      getMobileWorkspaceChannelSurface(channels[0]!, { isExplicitlyOpened: false }),
      "workspace-browser",
    );
    assert.equal(
      getMobileWorkspaceChannelSurface(channels[0]!, { isExplicitlyOpened: true }),
      "channel-chat",
    );
    assert.equal(
      getMobileWorkspaceChannelSurface(channels[1]!, { isExplicitlyOpened: true }),
      "voice-room",
    );
    assert.equal(
      getMobileWorkspaceChannelSurface(null, { isExplicitlyOpened: true }),
      "workspace-browser",
    );
  });

  it("builds a bounded channel chat header model from real workspace data", () => {
    const channels = getMobileWorkspaceChannels(workspaceDetail);

    assert.deepEqual(
      getMobileChannelChatHeaderModel(channels[2]!, {
        fallbackChannelName: "channel",
        memberCount: 5,
        membersSuffix: "members",
        serverName: "Whispr Product",
      }),
      {
        accessibilityLabel: "alerts, Whispr Product, 5 members",
        channelName: "alerts",
        memberCountLabel: "5 members",
        serverName: "Whispr Product",
        topic: null,
      },
    );
    assert.equal(
      getMobileChannelChatHeaderModel(
        {
          ...channels[0]!,
          name: "a".repeat(90),
          topic: "b".repeat(180),
        },
        {
          fallbackChannelName: "channel",
          memberCount: 123,
          membersSuffix: "members",
          serverName: "c".repeat(90),
        },
      ).accessibilityLabel.length <= 160,
      true,
    );
  });

  it("keeps channel search lazy and tied to the real message search contract", () => {
    assert.deepEqual(
      getMobileChannelChatSearchVisibility({
        closeLabel: "Close search",
        featureStatus: "available",
        hasActiveSearchContext: false,
        isSearchPanelOpen: false,
        openLabel: "Search channel",
      }),
      {
        isSearchAvailable: true,
        shouldRenderSearchPanel: false,
        toggleAccessibilityLabel: "Search channel",
      },
    );

    assert.deepEqual(
      getMobileChannelChatSearchVisibility({
        closeLabel: "Close search",
        featureStatus: "available",
        hasActiveSearchContext: true,
        isSearchPanelOpen: false,
        openLabel: "Search channel",
      }),
      {
        isSearchAvailable: true,
        shouldRenderSearchPanel: true,
        toggleAccessibilityLabel: "Close search",
      },
    );

    assert.deepEqual(
      getMobileChannelChatSearchVisibility({
        closeLabel: "Close search",
        featureStatus: "requires-server-contract",
        hasActiveSearchContext: true,
        isSearchPanelOpen: true,
        openLabel: "Search channel",
      }),
      {
        isSearchAvailable: false,
        shouldRenderSearchPanel: false,
        toggleAccessibilityLabel: "Search channel",
      },
    );
  });

  it("groups and filters workspace channels without inventing mobile data", () => {
    const sections = getMobileWorkspaceChannelSections(workspaceDetail, {
      ungrouped: "Other",
    });

    assert.deepEqual(
      sections.map((section) => [section.id, section.name, section.channels.length]),
      [
        ["ungrouped", "Other", 1],
        ["category-1", "Lobby", 2],
      ],
    );

    assert.deepEqual(
      filterMobileWorkspaceChannelSections(sections, "alert").map((section) => [
        section.name,
        section.channels.map((channel) => channel.id),
      ]),
      [["Lobby", ["text-2"]]],
    );

    assert.deepEqual(
      filterMobileWorkspaceChannelSections(sections, "lobby").map((section) => [
        section.name,
        section.channels.map((channel) => channel.id),
      ]),
      [["Lobby", ["voice-1", "text-2"]]],
    );
  });

  it("keeps a freshly created empty category as its own section", () => {
    const detail = {
      ...workspaceDetail,
      categories: [
        ...workspaceDetail.categories,
        { channels: [], id: "category-empty", name: "Duyurular", position: 1 },
      ],
    };

    const sections = getMobileWorkspaceChannelSections(detail, { ungrouped: "Other" });

    // Dropping it here is what made "kategori oluştur" look like a no-op: the
    // category existed on the server but never reached the channel list.
    assert.deepEqual(
      sections.map((section) => [section.id, section.channels.length]),
      [
        ["ungrouped", 1],
        ["category-1", 2],
        ["category-empty", 0],
      ],
    );

    // Search still hides it unless the category name itself matches.
    assert.deepEqual(
      filterMobileWorkspaceChannelSections(sections, "alert").map((section) => section.id),
      ["category-1"],
    );
    assert.deepEqual(
      filterMobileWorkspaceChannelSections(sections, "duyuru").map((section) => [
        section.id,
        section.channels.length,
      ]),
      [["category-empty", 0]],
    );
  });

  it("hides channels for collapsed workspace sections without losing section headers", () => {
    const sections = getMobileWorkspaceChannelSections(workspaceDetail, {
      ungrouped: "Other",
    });

    const visibleSections = getVisibleMobileWorkspaceChannelSections(sections, {
      "category-1": true,
    });

    assert.deepEqual(
      visibleSections.map((section) => [
        section.id,
        section.name,
        section.isCollapsed,
        section.channels.map((channel) => channel.id),
        section.totalChannelCount,
      ]),
      [
        ["ungrouped", "Other", false, ["text-1"], 1],
        ["category-1", "Lobby", true, [], 2],
      ],
    );
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

  it("renders every loaded message unless a preview surface asks for a bound", () => {
    const loaded = Array.from({ length: 90 }, (_, index) => ({
      ...message,
      createdAt: `2026-06-30T09:${String(index % 60).padStart(2, "0")}:00.000Z`,
      id: `message-${index}`,
    }));

    assert.equal(getMobileMessageStreamItems(loaded).length, 90);
    assert.equal(getMobileMessageStreamItems(loaded, 10).length, 10);
    assert.equal(getMobileMessageStreamItems(loaded, 10)[0]?.message.id, "message-80");
  });

  it("marks only consecutive same-author channel messages for the compact 1b group layout", () => {
    const nextAuthorMessage: ChatMessage = {
      ...message,
      author: { ...message.author, id: "user-3", username: "zoe" },
      createdAt: "2026-06-30T09:17:00.000Z",
      id: "message-next-author",
    };
    const nextDayMessage: ChatMessage = {
      ...message,
      createdAt: "2026-07-01T09:18:00.000Z",
      id: "message-next-day",
    };
    const streamItems = getMobileMessageStreamItems([
      message,
      { ...message, createdAt: "2026-06-30T09:16:00.000Z", id: "message-same-author" },
      nextAuthorMessage,
      nextDayMessage,
    ]);

    assert.deepEqual(
      streamItems.map((item) => [
        item.message.id,
        item.isGroupedWithPrevious,
        item.isGroupedWithNext,
      ]),
      [
        ["message-1", false, true],
        ["message-same-author", true, false],
        ["message-next-author", false, false],
        ["message-next-day", false, false],
      ],
    );
  });

  it("keeps channel message list virtualization bounded", () => {
    assert.deepEqual(getMobileMessageListPerformanceConfig(0), {
      initialNumToRender: 8,
      maxToRenderPerBatch: 8,
      windowSize: 5,
    });
    assert.deepEqual(getMobileMessageListPerformanceConfig(24), {
      initialNumToRender: 12,
      maxToRenderPerBatch: 10,
      windowSize: 7,
    });
    assert.deepEqual(getMobileMessageListPerformanceConfig(600), {
      initialNumToRender: 12,
      maxToRenderPerBatch: 10,
      windowSize: 7,
    });
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

  it("clears a stale channel surface when navigation leaves the overview tab", () => {
    assert.equal(resolveMobileTabActiveTextChannelId("overview", "channel-1"), "channel-1");
    assert.equal(resolveMobileTabActiveTextChannelId("settings", "channel-1"), null);
    assert.equal(resolveMobileTabActiveTextChannelId("messages", "channel-1"), null);
  });
});

describe("mobile unread badge formatting", () => {
  it("renders the API cap as a ceiling instead of an exact total", () => {
    assert.equal(formatMobileUnreadCount(0), "0");
    assert.equal(formatMobileUnreadCount(-3), "0");
    assert.equal(formatMobileUnreadCount(7), "7");
    assert.equal(formatMobileUnreadCount(98), "98");
    assert.equal(formatMobileUnreadCount(MOBILE_UNREAD_DISPLAY_CAP), "99+");
    assert.equal(formatMobileUnreadCount(4_812), "99+");
  });

  it("degrades non-finite and fractional counts without printing NaN", () => {
    assert.equal(formatMobileUnreadCount(Number.NaN), "0");
    assert.equal(formatMobileUnreadCount(Number.POSITIVE_INFINITY), "99+");
    assert.equal(formatMobileUnreadCount(12.7), "12");
  });
});
