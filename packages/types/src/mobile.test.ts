import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as mobileSchemas from "./mobile";
import {
  MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT,
  MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT,
  MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT,
  MobileAuthExchangeRequestSchema,
  MobileAuthExchangeResponseSchema,
  MobileAuthForgotPasswordRequestSchema,
  MobileAuthForgotPasswordResponseSchema,
  MobileAuthGoogleLoginRequestSchema,
  MobileAuthGoogleLoginResponseSchema,
  MobileAuthPasswordLoginRequestSchema,
  MobileAuthPasswordLoginResponseSchema,
  MobileAuthRefreshRequestSchema,
  MobileAuthRefreshResponseSchema,
  MobileAuthRegisterRequestSchema,
  MobileAuthRegisterResponseSchema,
  MobileAuthRevokeRequestSchema,
  MobileAuthVerificationEmailRequestSchema,
  MobileAuthVerificationEmailResponseSchema,
  MobileBootstrapDeepLinkIntentSchema,
  MobileBootstrapDMConversationSummarySchema,
  MobileBootstrapDMParticipantSchema,
  MobileBootstrapFeatureSchema,
  MobileBootstrapFeatureStatusSchema,
  MobileBootstrapPayloadSchema,
  MobileBootstrapPermissionIntentSchema,
  MobileBootstrapServerSummarySchema,
  MobileChannelLastMessagePreviewAuthorSchema,
  MobileChannelLastMessagePreviewSchema,
  MobileChannelMarkReadResponseSchema,
  MobileChannelMessagePinResponseSchema,
  MobileChannelMessagesResponseSchema,
  MobileChannelMessagesStaleEventSchema,
  MobileChannelPinnedMessagesResponseSchema,
  MobileChannelThreadMessagesResponseSchema,
  MobileChannelSendMessageRequestSchema,
  MobileChannelSendMessageResponseSchema,
  MobileDMConversationLastMessagePreviewSchema,
  MobileDMConversationListItemSchema,
  MobileDMConversationPreviewAuthorSchema,
  MobileDMConversationPreviewDeliverySchema,
  MobileDMConversationPreviewKindSchema,
  MobileDMConversationsQuerySchema,
  MobileDMConversationsResponseSchema,
  MobileDMMessagesThreadResponseSchema,
  MobileDMMessagesResponseSchema,
  MobileDMMarkReadResponseSchema,
  MobileDMParticipantReadStateSchema,
  MobileDMCallAcceptedEventSchema,
  MobileDMConversationNotifyEventSchema,
  MobileDMConversationPinEventSchema,
  MobileDMGroupInviteEventSchema,
  MobileDMGroupPinEventSchema,
  MobileDMGroupRoleEventSchema,
  MobileDMGroupSettingsEventSchema,
  MobileDMMessageExpiredEventSchema,
  MobileDMCallIncomingEventSchema,
  MobileDMCallPeerSchema,
  MobileDMCallSignalEventSchema,
  MobileDMDeliveredUpdatedEventSchema,
  MobileDMReadUpdatedEventSchema,
  MobileDMSendMessageRequestSchema,
  MobileDMSendMessageResponseSchema,
  MobileMessageDeleteResponseSchema,
  MobileMessageEditRequestSchema,
  MobileMessageReactionRequestSchema,
  MobileMessageReactionResponseSchema,
  MobileLegalDocumentBlockSchema,
  MobileLegalDocumentIdSchema,
  MobileLegalDocumentParamsSchema,
  MobileLegalDocumentResponseSchema,
  MobileNotificationEventKindSchema,
  MobileNotificationFilterSchema,
  MobileNotificationIdParamsSchema,
  MobileNotificationItemSchema,
  MobileNotificationMutationResponseSchema,
  MobileNotificationNewEventSchema,
  MobileNotificationTypeSchema,
  MobileNotificationsQuerySchema,
  MobileNotificationsResponseSchema,
  MobilePushPlatformSchema,
  MobilePushProviderSchema,
  MobilePushRegistrationRequestSchema,
  MobilePushRegistrationResponseSchema,
  MobilePushRegistrationRevokeResponseSchema,
  MobileServerUnreadUpdateEventSchema,
  MobileSessionSchemaVersionSchema,
  MobileSessionSnapshotSchema,
  MobileSessionTokensSchema,
  MobileSessionUserSchema,
  MobileVoiceChannelStateSchema,
  MobileVoiceHeartbeatRequestSchema,
  MobileVoiceHeartbeatResponseSchema,
  MobileVoiceScreenShareUpdateEventSchema,
  MobileVoiceStateDeleteRequestSchema,
  MobileVoiceStateLeaveResponseSchema,
  MobileVoiceStateMutationResponseSchema,
  MobileVoiceStateParticipantSchema,
  MobileVoiceStateUpdateEventSchema,
  MobileVoiceStatesQuerySchema,
  MobileVoiceStatesResponseSchema,
  MobileVoiceStateUpsertRequestSchema,
  MobileVoiceTokenProviderSchema,
  MobileVoiceTokenRequestSchema,
  MobileVoiceTokenResponseSchema,
  MobileWorkspaceCategorySummarySchema,
  MobileWorkspaceChannelSummarySchema,
  MobileWorkspaceServerDetailResponseSchema,
  MobileWorkspaceServerDetailSchema,
  MobileAppChannelRequestSchema,
  MobileAppChannelResponseSchema,
  MobileAppUpdateLatestSchema,
  MobileAppUpdateQuerySchema,
  MobileAppUpdateResponseSchema,
  MobileAppUpdateStateSchema,
  MobileAndroidArtifactSchema,
  MobileBuildEnvironmentSchema,
  MobileBugReportCategorySchema,
  MobileBugReportRequestSchema,
  MobileBugReportResponseSchema,
  MobileInvitePreviewResponseSchema,
  MobileHelpArticleListQuerySchema,
  MobileHelpArticleListResponseSchema,
  MobileHelpArticleSchema,
  MobileHelpArticleSlugParamsSchema,
  MobileHelpArticleViewResponseSchema,
  MobileHelpCategoryCountSchema,
  MobileHelpCategorySchema,
  MobileHelpSearchQuerySchema,
  MobileReleaseChangeSchema,
  MobileReleaseChangeTypeSchema,
  MobileReleaseChannelSchema,
  MobileReleaseDetailSchema,
  MobileReleaseListQuerySchema,
  MobileReleaseListResponseSchema,
  MobileReleaseSummarySchema,
  MobileReleaseVersionParamsSchema,
  MobileServiceStatusLevelSchema,
  MobileServiceStatusResponseSchema,
  MobileUpdateKindSchema,
  MobileUpdatePlatformSchema,
  formatBugReportTicket,
} from "./mobile";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";
import { ServerPublicProfileSchema } from "./workspace";

const now = "2026-07-09T12:00:00.000Z";
/**
 * The invite preview is `ServerPublicProfileSchema` plus a slug (Faz 1 §B6.5),
 * so the fixture is a full profile rather than the narrower payload the
 * preview used to carry.
 */
const invitePreviewProfile = {
  accessLevel: "public" as const,
  admins: [],
  bannerUrl: null,
  canManageServer: false,
  channelCount: 1,
  channels: [
    {
      categoryId: null,
      categoryName: null,
      id: "channel-1",
      isPrivate: false,
      lastActivityAt: null,
      liveCount: null,
      name: "duyurular",
      participants: [],
      readOnly: true,
      type: "text" as const,
    },
  ],
  createdAt: "2026-01-02T03:04:05.000Z",
  description: "Yol haritasını burada tartışıyoruz.",
  discoverable: true,
  iconUrl: null,
  inviteAddress: "whispr.gg/whispr-community",
  isPublic: true,
  joined: false,
  joinedAt: null,
  memberCount: 12_400,
  muted: false,
  mutualFriendCount: 0,
  mutualFriends: [],
  name: "Whispr Topluluk",
  notificationLevel: "all" as const,
  onlineCount: 1_200,
  serverId: "server-1",
  shortName: null,
  starred: false,
  tags: [],
  type: "COMMUNITY" as const,
  upcomingEvent: null,
  verified: true,
  voiceActiveCount: 0,
  weeklyMessageCount: null,
};
const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("mobile update delivery contract", () => {
  it("accepts the build identity needed to choose an update path", () => {
    assert.deepEqual(
      MobileAppUpdateQuerySchema.parse({
        buildEnvironment: "uat",
        channel: "uat",
        installed: "0.8.15",
        platform: "android",
        runtimeVersion: "fingerprint-2026-07-30",
        versionCode: "815",
      }),
      {
        buildEnvironment: "uat",
        channel: "uat",
        installed: "0.8.15",
        platform: "android",
        runtimeVersion: "fingerprint-2026-07-30",
        versionCode: 815,
      },
    );
  });

  it("accepts a newer internal Android APK with independently verifiable metadata", () => {
    const parsed = MobileAppUpdateResponseSchema.parse({
      androidArtifact: {
        sha256: "a".repeat(64),
        signingCertSha256: Array(32).fill("AB").join(":"),
        sizeBytes: 50_541_363,
        url: "https://updates.whispr.team/mobile/uat/whispr-816.apk",
        versionCode: 816,
      },
      lastCheckedAt: now,
      minSupportedVersionCode: 810,
      otaEnabled: true,
      state: "available",
      updateKind: "apk",
    });

    assert.equal(parsed.updateKind, "apk");
    assert.equal(parsed.androidArtifact?.versionCode, 816);
    assert.equal(parsed.minSupportedVersionCode, 810);
  });

  it("rejects APK metadata that cannot be checked safely", () => {
    const base = {
      sha256: "a".repeat(64),
      sizeBytes: 50_541_363,
      url: "https://updates.whispr.team/mobile/uat/whispr-816.apk",
      versionCode: 816,
    };

    for (const invalid of [
      { ...base, sha256: "ABC" },
      { ...base, sizeBytes: 0 },
      { ...base, url: "http://updates.whispr.team/whispr.apk" },
      { ...base, versionCode: 0 },
    ]) {
      assert.equal(MobileAndroidArtifactSchema.safeParse(invalid).success, false);
    }

    assert.equal(
      MobileAppUpdateResponseSchema.safeParse({
        lastCheckedAt: now,
        otaEnabled: true,
        state: "available",
        updateKind: "apk",
      }).success,
      false,
    );
    assert.equal(
      MobileAppUpdateResponseSchema.safeParse({
        androidArtifact: base,
        lastCheckedAt: now,
        otaEnabled: false,
        state: "current",
        updateKind: "none",
      }).success,
      false,
    );
  });
});

describe("mobile realtime stale-channel contract", () => {
  it("validates only the bounded user-room payload needed to refresh a workspace", () => {
    const schema = (mobileSchemas as Record<string, unknown>)
      .MobileChannelMessagesStaleEventSchema as
      { safeParse(input: unknown): { success: boolean } } | undefined;

    assert.ok(schema);
    assert.equal(
      schema.safeParse({
        channelId: "channel-1",
        latestMessageId: "message-1",
        serverId: "server-1",
      }).success,
      true,
    );
    assert.equal(
      schema.safeParse({
        channelId: "channel-1",
        latestMessageId: "",
        serverId: "server-1",
      }).success,
      false,
    );
  });
});

const sessionUser = {
  avatarUrl: null,
  displayName: "Ada Lovelace",
  id: "user-1",
  username: "ada",
};

const sessionTokens = {
  accessToken: "a".repeat(16),
  expiresAt: 2_000,
  issuedAt: 1_000,
  refreshToken: "r".repeat(16),
  scopes: ["mobile"],
  tokenType: "Bearer" as const,
};

const session = {
  lastValidatedAt: 1_000,
  schemaVersion: 1 as const,
  tokens: sessionTokens,
  user: sessionUser,
};

const feature = { label: "Voice", status: "available" as const };

const voiceParticipant = {
  avatarUrl: null,
  displayName: "Ada",
  isScreenSharing: false,
  userId: "user-1",
  username: "ada",
};

const voiceState = { channelId: "channel-1", participants: [voiceParticipant] };

const bootstrapServer = {
  channelCount: 1,
  iconUrl: null,
  id: "server-1",
  joinedAt: now,
  memberCount: 1,
  mentionCount: 0,
  name: "Analytical Engine",
  shortName: "AE",
  unreadCount: 0,
};

const bootstrapDMParticipant = {
  avatarUrl: null,
  displayName: "Charles",
  id: "user-2",
  status: "ONLINE",
  username: "charles",
};

const dmCallPeer = {
  avatarUrl: null,
  displayName: "Charles",
  id: "user-2",
  username: "charles",
};

const bootstrapConversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessageAt: now,
  muted: false,
  name: null,
  participantCount: 1,
  participants: [bootstrapDMParticipant],
  type: "DM" as const,
  unreadCount: 0,
};

const mobileDMConversation = {
  ...bootstrapConversation,
  lastMessage: {
    author: { displayName: "Ada", id: "user-1", username: "ada" },
    authorIsCurrentUser: true,
    createdAt: now,
    id: "message-1",
    text: "Hello",
  },
};

const bootstrapPayload = {
  app: {
    buildId: "build-1",
    name: "Whispr" as const,
    releaseChannel: "uat",
    serverTime: now,
    version: "0.8.15",
  },
  contracts: {
    deepLinks: ["route" as const],
    permissions: ["notifications" as const],
  },
  features: {
    messages: feature,
    nativeAuthTokenExchange: feature,
    pushNotifications: feature,
    voice: feature,
  },
  home: {
    directMessages: { recent: [bootstrapConversation], totalCount: 1, unreadCount: 0 },
    servers: { recent: [bootstrapServer], totalCount: 1 },
  },
  user: {
    avatarUrl: null,
    displayName: "Ada Lovelace",
    id: "user-1",
    locale: "en" as const,
    status: "ONLINE",
    username: "ada",
  },
};

const dmAuthor = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  id: "user-1",
  status: "ONLINE" as const,
  username: "ada",
};

const dmMessage = {
  attachments: [],
  author: dmAuthor,
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

const dmParticipant = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Ada",
  muted: false,
  presence: { customStatus: null, status: "ONLINE" as const },
  status: "ONLINE" as const,
  unreadCount: 0,
  userId: "user-1",
  username: "ada",
};

const dmConversation = {
  iconUrl: null,
  id: "conversation-1",
  lastMessage: dmMessage,
  lastMessageAt: now,
  name: null,
  ownerId: null,
  participants: [dmParticipant],
  type: "DM" as const,
};

const workspaceChannel = {
  categoryId: null,
  categoryName: null,
  id: "channel-1",
  lastMessage: {
    author: { displayName: "Ada", id: "user-1", username: "ada" },
    createdAt: now,
    id: "message-1",
    text: "Hello",
  },
  locked: false,
  mentionCount: 0,
  name: "general",
  position: 0,
  readOnly: false,
  topic: null,
  type: "TEXT" as const,
  unreadCount: 0,
};

const workspaceCategory = {
  channels: [workspaceChannel],
  id: "category-1",
  name: "General",
  position: 0,
};

const workspaceDetail = {
  categories: [workspaceCategory],
  hasMoreChannels: false,
  members: [],
  server: {
    allowFileUploads: true,
    allowGifs: true,
    defaultChannelId: "channel-1",
    description: null,
    iconUrl: null,
    id: "server-1",
    memberCount: 1,
    mentionCount: 0,
    name: "Analytical Engine",
    onlineMemberCount: 1,
    shortName: "AE",
    unreadCount: 0,
    visibleChannelCount: 1,
  },
  ungroupedChannels: [],
};

const chatMessage = {
  attachments: [],
  author: {
    avatarUrl: null,
    displayName: "Ada",
    id: "user-1",
    username: "ada",
  },
  channelId: "channel-1",
  content: "Hello",
  createdAt: now,
  deletedAt: null,
  editedAt: null,
  id: "message-1",
  reactions: [],
  type: "DEFAULT" as const,
};

const uploadedAttachment = { id: uuid };

const releaseChange = {
  detail: "Görünüm ayarlarında dört kademe (14–18px).",
  title: "Mesaj yazı boyutu",
  type: "new" as const,
};

const releaseSummary = {
  changeCount: 7,
  codename: "Echo",
  highlight: "okunabilirlik",
  installed: true,
  releasedAt: now,
  version: "0.8.15",
};

const releaseDetail = {
  ...releaseSummary,
  buildNumber: 8150,
  changes: [releaseChange],
  sizeBytes: 49_099_571,
  summary: "Okunabilirlik güncellemesi.",
};

const helpArticle = {
  bodyMarkdown: "# Mikrofon sorunları",
  category: "media" as const,
  hasBody: true,
  id: "help-1",
  readMinutes: 3,
  slug: "mikrofon-calismiyor",
  title: "Sesli kanalda mikrofonum çalışmıyor",
  url: "https://whispr.team/help/mikrofon-calismiyor",
  views: 24_000,
};

const bugReport = {
  appBuild: "8150",
  appVersion: "0.8.15",
  body: "Sesli kanalda mikrofon açıkken kimse beni duymuyor.",
  category: "voice" as const,
  deviceInfo: { deviceModel: "iPhone 15", osName: "iOS", osVersion: "18.2" },
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: false,
  logExcerpt: "WARN audio route changed\nERROR publish failed",
  platform: "ios",
  releaseChannel: "stable" as const,
};

describe("mobile schemas", () => {
  it("accepts a bounded Google two-factor credential and rejects blank input", () => {
    const idToken = `${"a".repeat(40)}.${"b".repeat(40)}.${"c".repeat(40)}`;

    assert.equal(
      MobileAuthGoogleLoginRequestSchema.parse({
        idToken,
        twoFactorCode: "  recovery-code  ",
      }).twoFactorCode,
      "recovery-code",
    );
    assert.equal(
      MobileAuthGoogleLoginRequestSchema.safeParse({ idToken, twoFactorCode: "   " }).success,
      false,
    );
    assert.equal(
      MobileAuthGoogleLoginRequestSchema.safeParse({
        idToken,
        twoFactorCode: "x".repeat(65),
      }).success,
      false,
    );
  });

  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(mobileSchemas, {
      MobileAuthExchangeRequestSchema: {
        schema: MobileAuthExchangeRequestSchema,
        valid: { callbackPath: "/mobile/callback", handoffToken: "a".repeat(32) },
        invalid: { callbackPath: "/mobile/callback", handoffToken: "short" },
      },
      MobileAuthExchangeResponseSchema: {
        schema: MobileAuthExchangeResponseSchema,
        valid: { session },
        invalid: { session: null },
      },
      MobileAuthForgotPasswordRequestSchema: {
        schema: MobileAuthForgotPasswordRequestSchema,
        valid: { email: "ada@example.com", locale: "tr" },
        invalid: { email: "ada", locale: "tr" },
      },
      MobileAuthForgotPasswordResponseSchema: {
        schema: MobileAuthForgotPasswordResponseSchema,
        valid: { email: "ada@example.com", message: "Accepted", status: "accepted" },
        invalid: { email: "ada@example.com", message: "Accepted", status: "sent" },
      },
      MobileAuthGoogleLoginRequestSchema: {
        schema: MobileAuthGoogleLoginRequestSchema,
        valid: { idToken: `${"a".repeat(40)}.${"b".repeat(40)}.${"c".repeat(40)}` },
        invalid: { idToken: "not-a-compact-jws" },
      },
      MobileAuthGoogleLoginResponseSchema: {
        schema: MobileAuthGoogleLoginResponseSchema,
        valid: { session },
        invalid: { session: {} },
      },
      MobileAuthPasswordLoginRequestSchema: {
        schema: MobileAuthPasswordLoginRequestSchema,
        valid: {
          email: "ada@example.com",
          password: "correct-horse",
        },
        invalid: { email: "ada@example.com", password: "" },
      },
      MobileAuthPasswordLoginResponseSchema: {
        schema: MobileAuthPasswordLoginResponseSchema,
        valid: { session },
        invalid: { session: undefined },
      },
      MobileAuthRefreshRequestSchema: {
        schema: MobileAuthRefreshRequestSchema,
        valid: { refreshToken: "r".repeat(16) },
        invalid: { refreshToken: "has whitespace token" },
      },
      MobileAuthRefreshResponseSchema: {
        schema: MobileAuthRefreshResponseSchema,
        valid: { session },
        invalid: { session: {} },
      },
      MobileAuthRegisterRequestSchema: {
        schema: MobileAuthRegisterRequestSchema,
        valid: {
          confirmPassword: "correct-horse",
          email: "ada@example.com",
          locale: "en",
          password: "correct-horse",
          username: "ada_lovelace",
        },
        invalid: {
          confirmPassword: "different",
          email: "ada@example.com",
          password: "correct-horse",
          username: "ada_lovelace",
        },
      },
      MobileAuthRegisterResponseSchema: {
        schema: MobileAuthRegisterResponseSchema,
        valid: {
          email: "ada@example.com",
          message: "Verify email",
          status: "verification-required",
        },
        invalid: { email: "ada@example.com", message: "", status: "verification-required" },
      },
      MobileAuthRevokeRequestSchema: {
        schema: MobileAuthRevokeRequestSchema,
        valid: { refreshToken: null },
        invalid: { refreshToken: "short" },
      },
      MobileAuthVerificationEmailRequestSchema: {
        schema: MobileAuthVerificationEmailRequestSchema,
        valid: { email: "ada@example.com", locale: "en" },
        invalid: { email: "ada@example.com", locale: "de" },
      },
      MobileAuthVerificationEmailResponseSchema: {
        schema: MobileAuthVerificationEmailResponseSchema,
        valid: { email: "ada@example.com", message: "Accepted", status: "accepted" },
        invalid: { email: "ada@example.com", message: "Accepted", status: "pending" },
      },
      MobileBootstrapDeepLinkIntentSchema: {
        schema: MobileBootstrapDeepLinkIntentSchema,
        valid: "invite",
        invalid: "external",
      },
      MobileBootstrapDMConversationSummarySchema: {
        schema: MobileBootstrapDMConversationSummarySchema,
        valid: bootstrapConversation,
        invalid: { ...bootstrapConversation, participantCount: -1 },
      },
      MobileBootstrapDMParticipantSchema: {
        schema: MobileBootstrapDMParticipantSchema,
        valid: bootstrapDMParticipant,
        invalid: { ...bootstrapDMParticipant, username: "" },
      },
      MobileDMCallPeerSchema: {
        schema: MobileDMCallPeerSchema,
        valid: dmCallPeer,
        invalid: { ...dmCallPeer, username: "" },
      },
      MobileDMCallIncomingEventSchema: {
        schema: MobileDMCallIncomingEventSchema,
        valid: {
          conversationId: "conversation-1",
          expiresAt: "2026-07-19T12:00:45.000Z",
          fromUser: dmCallPeer,
          video: false,
        },
        invalid: {
          conversationId: "conversation-1",
          expiresAt: "2026-07-19T12:00:45.000Z",
          fromUser: dmCallPeer,
          video: "yes",
        },
      },
      MobileDMCallSignalEventSchema: {
        schema: MobileDMCallSignalEventSchema,
        valid: { conversationId: "conversation-1", userId: "user-1" },
        invalid: { conversationId: "conversation-1", userId: "" },
      },
      MobileDMCallAcceptedEventSchema: {
        schema: MobileDMCallAcceptedEventSchema,
        valid: { conversationId: "conversation-1", userId: "user-1", video: true },
        invalid: { conversationId: "", userId: "user-1", video: true },
      },
      MobileDMConversationNotifyEventSchema: {
        schema: MobileDMConversationNotifyEventSchema,
        valid: { conversationId: "conversation-1", notifyLevel: "MENTIONS" },
        invalid: { conversationId: "conversation-1", notifyLevel: "LOUD" },
      },
      MobileDMConversationPinEventSchema: {
        schema: MobileDMConversationPinEventSchema,
        valid: { conversationId: "conversation-1", pinnedAt: "2026-08-11T10:00:00.000Z" },
        invalid: { conversationId: "conversation-1", pinnedAt: "yesterday" },
      },
      MobileDMGroupInviteEventSchema: {
        schema: MobileDMGroupInviteEventSchema,
        valid: { conversationId: "conversation-1", enabled: true },
        invalid: { conversationId: "conversation-1", enabled: "yes" },
      },
      MobileDMGroupPinEventSchema: {
        schema: MobileDMGroupPinEventSchema,
        valid: {
          conversationId: "conversation-1",
          pinnedMessage: {
            authorName: "Doğukan",
            dismissed: false,
            excerpt: "Demo yarın 16:00",
            id: "message-1",
          },
        },
        invalid: { conversationId: "conversation-1", pinnedMessage: { id: "message-1" } },
      },
      MobileDMGroupRoleEventSchema: {
        schema: MobileDMGroupRoleEventSchema,
        valid: {
          conversationId: "conversation-1",
          ownerId: "user-1",
          role: "ADMIN",
          userId: "user-2",
        },
        invalid: {
          conversationId: "conversation-1",
          ownerId: "user-1",
          role: "SUPERUSER",
          userId: "user-2",
        },
      },
      MobileDMGroupSettingsEventSchema: {
        schema: MobileDMGroupSettingsEventSchema,
        valid: {
          avatarColor: "#4F46E5",
          conversationId: "conversation-1",
          description: null,
          disappearingAfter: "H24",
          historyVisibility: "LAST_30D",
          permissions: {
            addMembers: "ALL",
            editInfo: "ADMINS",
            pinMessage: "ADMINS",
            sendMessage: "ALL",
          },
        },
        invalid: {
          avatarColor: "#4F46E5",
          conversationId: "conversation-1",
          description: null,
          disappearingAfter: "H12",
          historyVisibility: "LAST_30D",
          permissions: {
            addMembers: "ALL",
            editInfo: "ADMINS",
            pinMessage: "ADMINS",
            sendMessage: "ALL",
          },
        },
      },
      MobileDMMessageExpiredEventSchema: {
        schema: MobileDMMessageExpiredEventSchema,
        valid: { conversationId: "conversation-1", messageIds: ["message-1", "message-2"] },
        invalid: { conversationId: "conversation-1", messageIds: [""] },
      },
      MobileDMConversationPreviewAuthorSchema: {
        schema: MobileDMConversationPreviewAuthorSchema,
        valid: mobileDMConversation.lastMessage.author,
        invalid: { ...mobileDMConversation.lastMessage.author, username: "" },
      },
      MobileDMConversationLastMessagePreviewSchema: {
        schema: MobileDMConversationLastMessagePreviewSchema,
        valid: mobileDMConversation.lastMessage,
        invalid: { ...mobileDMConversation.lastMessage, text: "" },
      },
      MobileDMConversationPreviewKindSchema: {
        schema: MobileDMConversationPreviewKindSchema,
        valid: "voice",
        invalid: "sticker",
      },
      MobileDMConversationPreviewDeliverySchema: {
        schema: MobileDMConversationPreviewDeliverySchema,
        valid: "delivered",
        invalid: "seen",
      },
      MobileDMConversationListItemSchema: {
        schema: MobileDMConversationListItemSchema,
        valid: mobileDMConversation,
        invalid: {
          ...mobileDMConversation,
          lastMessage: { ...mobileDMConversation.lastMessage, createdAt: "today" },
        },
      },
      MobileDMConversationsQuerySchema: {
        schema: MobileDMConversationsQuerySchema,
        valid: { cursor: "conversation-1", limit: 20 },
        invalid: { limit: 31 },
      },
      MobileDMConversationsResponseSchema: {
        schema: MobileDMConversationsResponseSchema,
        valid: { conversations: [mobileDMConversation], nextCursor: null, totalUnreadCount: 1 },
        invalid: { conversations: [mobileDMConversation], nextCursor: "", totalUnreadCount: 1 },
      },
      MobileBootstrapFeatureSchema: {
        schema: MobileBootstrapFeatureSchema,
        valid: feature,
        invalid: { ...feature, label: "" },
      },
      MobileBootstrapFeatureStatusSchema: {
        schema: MobileBootstrapFeatureStatusSchema,
        valid: "disabled",
        invalid: "beta",
      },
      MobileBootstrapPayloadSchema: {
        schema: MobileBootstrapPayloadSchema,
        valid: bootstrapPayload,
        invalid: { ...bootstrapPayload, contracts: { deepLinks: [], permissions: [] } },
      },
      MobileBootstrapPermissionIntentSchema: {
        schema: MobileBootstrapPermissionIntentSchema,
        valid: "screenCapture",
        invalid: "location",
      },
      MobileBootstrapServerSummarySchema: {
        schema: MobileBootstrapServerSummarySchema,
        valid: bootstrapServer,
        invalid: { ...bootstrapServer, joinedAt: "today" },
      },
      MobileChannelLastMessagePreviewAuthorSchema: {
        schema: MobileChannelLastMessagePreviewAuthorSchema,
        valid: workspaceChannel.lastMessage.author,
        invalid: { ...workspaceChannel.lastMessage.author, username: "" },
      },
      MobileChannelLastMessagePreviewSchema: {
        schema: MobileChannelLastMessagePreviewSchema,
        valid: workspaceChannel.lastMessage,
        invalid: { ...workspaceChannel.lastMessage, text: "" },
      },
      MobileChannelMarkReadResponseSchema: {
        schema: MobileChannelMarkReadResponseSchema,
        valid: {
          channelId: "channel-1",
          firstUnreadMessageId: null,
          mentionCount: 0,
          serverId: "server-1",
          serverMentionCount: 0,
          serverUnreadCount: 0,
          unreadCount: 0,
        },
        invalid: { channelId: "channel-1" },
      },
      MobileChannelMessagesResponseSchema: {
        schema: MobileChannelMessagesResponseSchema,
        valid: {
          channel: workspaceChannel,
          hasMore: false,
          messages: [chatMessage],
          nextCursor: null,
        },
        invalid: {
          channel: workspaceChannel,
          hasMore: false,
          messages: "message-1",
          nextCursor: null,
        },
      },
      MobileChannelMessagePinResponseSchema: {
        schema: MobileChannelMessagePinResponseSchema,
        valid: { message: { ...chatMessage, isPinned: true } },
        invalid: { message: null },
      },
      MobileChannelPinnedMessagesResponseSchema: {
        schema: MobileChannelPinnedMessagesResponseSchema,
        valid: { messages: [{ ...chatMessage, isPinned: true }] },
        invalid: { messages: chatMessage },
      },
      MobileChannelThreadMessagesResponseSchema: {
        schema: MobileChannelThreadMessagesResponseSchema,
        valid: {
          hasMore: false,
          messages: [chatMessage],
          nextCursor: null,
          parent: chatMessage,
        },
        invalid: {
          hasMore: false,
          messages: [chatMessage],
          nextCursor: null,
          parent: null,
        },
      },
      MobileChannelSendMessageRequestSchema: {
        schema: MobileChannelSendMessageRequestSchema,
        valid: { content: "Hello" },
        invalid: { content: "   " },
      },
      MobileChannelSendMessageResponseSchema: {
        schema: MobileChannelSendMessageResponseSchema,
        valid: { message: chatMessage },
        invalid: { message: null },
      },
      MobileDMMessagesResponseSchema: {
        schema: MobileDMMessagesResponseSchema,
        valid: {
          conversation: dmConversation,
          messages: [dmMessage],
          nextCursor: null,
          participantReadStates: [{ lastReadAt: "2026-07-17T08:00:00.000Z", userId: "user-1" }],
        },
        invalid: { conversation: dmConversation, messages: "message-1", nextCursor: null },
      },
      MobileDMParticipantReadStateSchema: {
        schema: MobileDMParticipantReadStateSchema,
        valid: { lastReadAt: "2026-07-17T08:00:00.000Z", userId: "user-1" },
        invalid: { lastReadAt: "not-a-date", userId: "user-1" },
      },
      MobileDMMarkReadResponseSchema: {
        schema: MobileDMMarkReadResponseSchema,
        valid: {
          conversationId: "conversation-1",
          participantReadStates: [{ lastReadAt: "2026-07-17T08:00:00.000Z", userId: "user-1" }],
        },
        invalid: { conversationId: "", participantReadStates: [] },
      },
      MobileDMReadUpdatedEventSchema: {
        schema: MobileDMReadUpdatedEventSchema,
        valid: {
          conversationId: "conversation-1",
          lastReadAt: "2026-07-17T08:00:00.000Z",
          userId: "user-1",
        },
        invalid: { conversationId: "conversation-1", lastReadAt: "nope", userId: "user-1" },
      },
      MobileDMDeliveredUpdatedEventSchema: {
        schema: MobileDMDeliveredUpdatedEventSchema,
        valid: {
          conversationId: "conversation-1",
          lastDeliveredAt: "2026-07-17T08:00:00.000Z",
          userId: "user-1",
        },
        invalid: { conversationId: "conversation-1", lastDeliveredAt: "nope", userId: "user-1" },
      },
      MobileDMMessagesThreadResponseSchema: {
        schema: MobileDMMessagesThreadResponseSchema,
        valid: { messages: [dmMessage], nextCursor: null, parent: dmMessage },
        invalid: { messages: [dmMessage], nextCursor: null, parent: null },
      },
      MobileDMSendMessageRequestSchema: {
        schema: MobileDMSendMessageRequestSchema,
        valid: { content: "Hello" },
        invalid: { content: "   " },
      },
      MobileDMSendMessageResponseSchema: {
        schema: MobileDMSendMessageResponseSchema,
        valid: { message: dmMessage },
        invalid: { message: null },
      },
      MobileMessageDeleteResponseSchema: {
        schema: MobileMessageDeleteResponseSchema,
        valid: { placeholderExpiresAt: now, status: "deleted" },
        invalid: { status: "deleted" },
      },
      MobileMessageEditRequestSchema: {
        schema: MobileMessageEditRequestSchema,
        valid: { content: "Edited message" },
        invalid: { content: "   " },
      },
      MobileMessageReactionRequestSchema: {
        schema: MobileMessageReactionRequestSchema,
        valid: { emoji: "👍" },
        invalid: { emoji: "   " },
      },
      MobileMessageReactionResponseSchema: {
        schema: MobileMessageReactionResponseSchema,
        valid: { reactions: [] },
        invalid: { reactions: "none" },
      },
      MobileNotificationEventKindSchema: {
        schema: MobileNotificationEventKindSchema,
        valid: "message-reaction",
        invalid: "unknown-event",
      },
      MobileNotificationFilterSchema: {
        schema: MobileNotificationFilterSchema,
        valid: "unread",
        invalid: "everything",
      },
      MobileNotificationIdParamsSchema: {
        schema: MobileNotificationIdParamsSchema,
        valid: { id: uuid },
        invalid: { id: "not-a-uuid" },
      },
      MobileNotificationItemSchema: {
        schema: MobileNotificationItemSchema,
        valid: {
          actionUrl: "/channels/server-1/channel-1",
          actor: null,
          body: "Ada mentioned you",
          channel: { id: "channel-1", name: "general" },
          createdAt: now,
          id: uuid,
          messageQuote: { id: "message-1", preview: null },
          read: false,
          readAt: null,
          server: { id: "server-1", name: "Whispr" },
          type: "MENTION",
        },
        invalid: { id: uuid, type: "UNKNOWN" },
      },
      MobileLegalDocumentIdSchema: {
        schema: MobileLegalDocumentIdSchema,
        valid: "cookies",
        invalid: "licenses",
      },
      MobileLegalDocumentParamsSchema: {
        schema: MobileLegalDocumentParamsSchema,
        valid: { legalDocument: "privacy" },
        invalid: { legalDocument: "../../secrets" },
      },
      MobileLegalDocumentBlockSchema: {
        schema: MobileLegalDocumentBlockSchema,
        valid: { kind: "heading", text: "1. Giriş" },
        invalid: { kind: "quote", text: "1. Giriş" },
      },
      MobileLegalDocumentResponseSchema: {
        schema: MobileLegalDocumentResponseSchema,
        valid: {
          badge: "Kişisel veri güvenliği",
          blocks: [{ kind: "paragraph", text: "Metin." }],
          description: "Açıklama.",
          id: "privacy",
          lastUpdated: "08.05.2026",
          title: "Gizlilik Politikası",
        },
        invalid: {
          badge: "Kişisel veri güvenliği",
          blocks: [{ kind: "paragraph", text: "" }],
          description: "Açıklama.",
          id: "privacy",
          lastUpdated: null,
          title: "Gizlilik Politikası",
        },
      },
      MobileNotificationNewEventSchema: {
        schema: MobileNotificationNewEventSchema,
        valid: {
          actionUrl: "/channels/server-1/channel-1",
          actor: {
            avatarUrl: "https://cdn.whispr.test/ada.png",
            displayName: "Ada",
            id: "user-1",
            username: "ada",
          },
          body: "Ada seni etiketledi",
          channel: { id: "channel-1", name: "genel" },
          createdAt: "2026-07-26T10:00:00.000Z",
          id: "notification-1",
          metadata: { messagePreview: "bakar mısın?" },
          read: false,
          readAt: null,
          server: { id: "server-1", name: "Whispr" },
          type: "MENTION",
          userId: "user-1",
        },
        invalid: {
          body: "Ada seni etiketledi",
          createdAt: "not-a-date",
          id: "notification-1",
          type: "MENTION",
          userId: "user-1",
        },
      },
      MobileNotificationMutationResponseSchema: {
        schema: MobileNotificationMutationResponseSchema,
        valid: { success: true },
        invalid: { success: false },
      },
      MobileNotificationTypeSchema: {
        schema: MobileNotificationTypeSchema,
        valid: "DM",
        invalid: "UNKNOWN",
      },
      MobileNotificationsQuerySchema: {
        schema: MobileNotificationsQuerySchema,
        valid: { cursor: "opaque-cursor", limit: 20 },
        invalid: { limit: 31 },
      },
      MobileNotificationsResponseSchema: {
        schema: MobileNotificationsResponseSchema,
        valid: { nextCursor: null, notifications: [] },
        invalid: { nextCursor: null, notifications: "invalid" },
      },
      MobilePushPlatformSchema: {
        schema: MobilePushPlatformSchema,
        valid: "android",
        invalid: "web",
      },
      MobilePushProviderSchema: {
        schema: MobilePushProviderSchema,
        valid: "expo",
        invalid: "firebase",
      },
      MobilePushRegistrationRequestSchema: {
        schema: MobilePushRegistrationRequestSchema,
        valid: {
          platform: "ios",
          provider: "expo",
          token: "ExpoPushToken[abcdefghij]",
        },
        invalid: { platform: "ios", provider: "expo", token: "invalid" },
      },
      MobilePushRegistrationResponseSchema: {
        schema: MobilePushRegistrationResponseSchema,
        valid: {
          provider: "expo",
          registered: true,
          registeredAt: now,
          tokenFingerprint: "f".repeat(32),
        },
        invalid: {
          provider: "expo",
          registered: true,
          registeredAt: now,
          tokenFingerprint: "short",
        },
      },
      MobilePushRegistrationRevokeResponseSchema: {
        schema: MobilePushRegistrationRevokeResponseSchema,
        valid: { revoked: true, revokedAt: now },
        invalid: { revoked: true, revokedAt: "today" },
      },
      MobileServerUnreadUpdateEventSchema: {
        schema: MobileServerUnreadUpdateEventSchema,
        valid: { mentionCount: 0, serverId: "server-1", unreadCount: 1 },
        invalid: { mentionCount: -1, serverId: "server-1", unreadCount: 1 },
      },
      MobileChannelMessagesStaleEventSchema: {
        schema: MobileChannelMessagesStaleEventSchema,
        valid: { channelId: "channel-1", latestMessageId: "message-1", serverId: "server-1" },
        invalid: { channelId: "channel-1", latestMessageId: "", serverId: "server-1" },
      },
      MobileSessionSchemaVersionSchema: {
        schema: MobileSessionSchemaVersionSchema,
        valid: 1,
        invalid: 2,
      },
      MobileSessionSnapshotSchema: {
        schema: MobileSessionSnapshotSchema,
        valid: session,
        invalid: { ...session, lastValidatedAt: Number.POSITIVE_INFINITY },
      },
      MobileSessionTokensSchema: {
        schema: MobileSessionTokensSchema,
        valid: sessionTokens,
        invalid: { ...sessionTokens, accessToken: "has whitespace token" },
      },
      MobileSessionUserSchema: {
        schema: MobileSessionUserSchema,
        valid: sessionUser,
        invalid: { ...sessionUser, username: "" },
      },
      MobileVoiceChannelStateSchema: {
        schema: MobileVoiceChannelStateSchema,
        valid: voiceState,
        invalid: { ...voiceState, participants: "user-1" },
      },
      MobileVoiceHeartbeatRequestSchema: {
        schema: MobileVoiceHeartbeatRequestSchema,
        valid: { selfScreenShare: true, sessionId: uuid },
        invalid: { sessionId: "not-a-uuid" },
      },
      MobileVoiceHeartbeatResponseSchema: {
        schema: MobileVoiceHeartbeatResponseSchema,
        valid: { channelId: "channel-1", serverId: "server-1", success: true },
        invalid: { channelId: "channel-1", serverId: "server-1", success: false },
      },
      MobileVoiceScreenShareUpdateEventSchema: {
        schema: MobileVoiceScreenShareUpdateEventSchema,
        valid: {
          channelId: "channel-1",
          isScreenSharing: true,
          serverId: "server-1",
          userId: "user-1",
        },
        invalid: {
          channelId: "channel-1",
          isScreenSharing: "true",
          serverId: "server-1",
          userId: "user-1",
        },
      },
      MobileVoiceStateDeleteRequestSchema: {
        schema: MobileVoiceStateDeleteRequestSchema,
        valid: { sessionId: uuid },
        invalid: { sessionId: "not-a-uuid" },
      },
      MobileVoiceStateLeaveResponseSchema: {
        schema: MobileVoiceStateLeaveResponseSchema,
        valid: { success: true },
        invalid: { success: false },
      },
      MobileVoiceStateMutationResponseSchema: {
        schema: MobileVoiceStateMutationResponseSchema,
        valid: {
          channelId: "channel-1",
          participants: [voiceParticipant],
          serverId: "server-1",
          sessionId: uuid,
        },
        invalid: {
          channelId: "channel-1",
          participants: [voiceParticipant],
          serverId: "server-1",
          sessionId: "not-a-uuid",
        },
      },
      MobileVoiceStateParticipantSchema: {
        schema: MobileVoiceStateParticipantSchema,
        valid: voiceParticipant,
        invalid: { ...voiceParticipant, userId: "" },
      },
      MobileVoiceStateUpdateEventSchema: {
        schema: MobileVoiceStateUpdateEventSchema,
        valid: {
          action: "join",
          channelId: "channel-1",
          participants: [voiceParticipant],
          serverId: "server-1",
          userId: "user-1",
        },
        invalid: {
          action: "connect",
          channelId: "channel-1",
          participants: [voiceParticipant],
          serverId: "server-1",
          userId: "user-1",
        },
      },
      MobileVoiceStatesQuerySchema: {
        schema: MobileVoiceStatesQuerySchema,
        valid: { serverId: "server-1" },
        invalid: { serverId: "" },
      },
      MobileVoiceStatesResponseSchema: {
        schema: MobileVoiceStatesResponseSchema,
        valid: { states: [voiceState] },
        invalid: { states: "channel-1" },
      },
      MobileVoiceStateUpsertRequestSchema: {
        schema: MobileVoiceStateUpsertRequestSchema,
        valid: { channelId: "channel-1", serverId: "server-1", sessionId: uuid },
        invalid: { channelId: "channel-1", serverId: "server-1", sessionId: "invalid" },
      },
      MobileVoiceTokenProviderSchema: {
        schema: MobileVoiceTokenProviderSchema,
        valid: "livekit",
        invalid: "webrtc",
      },
      MobileVoiceTokenRequestSchema: {
        schema: MobileVoiceTokenRequestSchema,
        valid: { channelId: "channel-1" },
        invalid: { channelId: "" },
      },
      MobileVoiceTokenResponseSchema: {
        schema: MobileVoiceTokenResponseSchema,
        valid: {
          channelId: "channel-1",
          mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" },
          provider: "livekit",
          token: "t".repeat(16),
          url: "wss://livekit.example.com",
        },
        invalid: {
          channelId: "channel-1",
          provider: "livekit",
          token: "short",
          url: "wss://livekit.example.com",
        },
      },
      MobileWorkspaceCategorySummarySchema: {
        schema: MobileWorkspaceCategorySummarySchema,
        valid: workspaceCategory,
        invalid: { ...workspaceCategory, position: -1 },
      },
      MobileWorkspaceChannelSummarySchema: {
        schema: MobileWorkspaceChannelSummarySchema,
        valid: workspaceChannel,
        invalid: { ...workspaceChannel, categoryName: "" },
      },
      MobileWorkspaceServerDetailResponseSchema: {
        schema: MobileWorkspaceServerDetailResponseSchema,
        valid: { detail: workspaceDetail },
        invalid: { detail: null },
      },
      MobileWorkspaceServerDetailSchema: {
        schema: MobileWorkspaceServerDetailSchema,
        valid: workspaceDetail,
        invalid: { ...workspaceDetail, hasMoreChannels: "false" },
      },
      MobileReleaseChangeTypeSchema: {
        schema: MobileReleaseChangeTypeSchema,
        valid: "improved",
        invalid: "IMPROVED",
      },
      MobileReleaseChannelSchema: {
        schema: MobileReleaseChannelSchema,
        valid: "beta",
        invalid: "canary",
      },
      MobileBuildEnvironmentSchema: {
        schema: MobileBuildEnvironmentSchema,
        valid: "uat",
        invalid: "beta",
      },
      MobileUpdatePlatformSchema: {
        schema: MobileUpdatePlatformSchema,
        valid: "android",
        invalid: "web",
      },
      MobileUpdateKindSchema: {
        schema: MobileUpdateKindSchema,
        valid: "apk",
        invalid: "download",
      },
      MobileAndroidArtifactSchema: {
        schema: MobileAndroidArtifactSchema,
        valid: {
          sha256: "a".repeat(64),
          sizeBytes: 50_541_363,
          url: "https://updates.whispr.team/mobile/uat/whispr-816.apk",
          versionCode: 816,
        },
        invalid: {
          sha256: "a".repeat(64),
          sizeBytes: 0,
          url: "https://updates.whispr.team/mobile/uat/whispr-816.apk",
          versionCode: 816,
        },
      },
      MobileAppUpdateStateSchema: {
        schema: MobileAppUpdateStateSchema,
        valid: "available",
        invalid: "up-to-date",
      },
      MobileServiceStatusLevelSchema: {
        schema: MobileServiceStatusLevelSchema,
        valid: "degraded",
        invalid: "partial",
      },
      MobileHelpCategorySchema: {
        schema: MobileHelpCategorySchema,
        valid: "account",
        invalid: "billing",
      },
      MobileBugReportCategorySchema: {
        schema: MobileBugReportCategorySchema,
        valid: "voice",
        invalid: "crash",
      },
      MobileReleaseChangeSchema: {
        schema: MobileReleaseChangeSchema,
        valid: releaseChange,
        invalid: { ...releaseChange, type: "NEW" },
      },
      MobileReleaseSummarySchema: {
        schema: MobileReleaseSummarySchema,
        valid: releaseSummary,
        invalid: { ...releaseSummary, changeCount: -1 },
      },
      MobileReleaseDetailSchema: {
        schema: MobileReleaseDetailSchema,
        valid: releaseDetail,
        invalid: { ...releaseDetail, sizeBytes: "49099571" },
      },
      MobileReleaseListResponseSchema: {
        schema: MobileReleaseListResponseSchema,
        valid: { nextCursor: null, releases: [releaseSummary], total: 38 },
        invalid: { nextCursor: null, releases: [releaseSummary] },
      },
      MobileReleaseListQuerySchema: {
        schema: MobileReleaseListQuerySchema,
        valid: { installed: "0.8.15", limit: "20" },
        invalid: { limit: "51" },
      },
      MobileAppUpdateLatestSchema: {
        schema: MobileAppUpdateLatestSchema,
        valid: { mandatory: false, releasedAt: now, sizeBytes: 50_541_363, version: "0.9.0" },
        invalid: { mandatory: false, releasedAt: now, version: "" },
      },
      MobileAppUpdateResponseSchema: {
        schema: MobileAppUpdateResponseSchema,
        valid: {
          lastCheckedAt: now,
          otaEnabled: false,
          state: "current",
          updateKind: "none",
        },
        invalid: {
          lastCheckedAt: now,
          otaEnabled: false,
          state: "idle",
          updateKind: "none",
        },
      },
      MobileAppUpdateQuerySchema: {
        schema: MobileAppUpdateQuerySchema,
        valid: { channel: "stable", installed: "0.8.15" },
        invalid: { channel: "nightly" },
      },
      MobileAppChannelRequestSchema: {
        schema: MobileAppChannelRequestSchema,
        valid: { channel: "beta", consentAt: now },
        invalid: { channel: "beta", consentAt: "2026-07-29" },
      },
      MobileAppChannelResponseSchema: {
        schema: MobileAppChannelResponseSchema,
        valid: { channel: "beta", effectiveFrom: "next-build", requiresRestart: true },
        invalid: { channel: "beta", effectiveFrom: "now", requiresRestart: true },
      },
      MobileServiceStatusResponseSchema: {
        schema: MobileServiceStatusResponseSchema,
        valid: { checkedAt: now, level: "ok", url: "https://status.whispr.team" },
        invalid: {
          checkedAt: now,
          label: "Sorunsuz",
          level: "ok",
          url: "https://status.whispr.team",
        },
      },
      MobileHelpArticleSchema: {
        schema: MobileHelpArticleSchema,
        valid: helpArticle,
        invalid: { ...helpArticle, bodyMarkdown: 42 },
      },
      MobileHelpCategoryCountSchema: {
        schema: MobileHelpCategoryCountSchema,
        valid: { articleCount: 14, key: "account" },
        invalid: { articleCount: 14, key: "account", label: "Hesap ve güvenlik" },
      },
      MobileHelpArticleListResponseSchema: {
        schema: MobileHelpArticleListResponseSchema,
        valid: { articles: [helpArticle], categories: [{ articleCount: 14, key: "account" }] },
        invalid: { articles: [helpArticle] },
      },
      MobileHelpArticleListQuerySchema: {
        schema: MobileHelpArticleListQuerySchema,
        valid: { category: "chat", popular: "1" },
        invalid: { popular: "yes" },
      },
      MobileHelpSearchQuerySchema: {
        schema: MobileHelpSearchQuerySchema,
        valid: { q: "mikrofon" },
        invalid: { q: "m" },
      },
      MobileHelpArticleViewResponseSchema: {
        schema: MobileHelpArticleViewResponseSchema,
        valid: { ok: true },
        invalid: { ok: false },
      },
      MobileBugReportRequestSchema: {
        schema: MobileBugReportRequestSchema,
        valid: bugReport,
        invalid: { ...bugReport, body: "çok kısa" },
      },
      MobileBugReportResponseSchema: {
        schema: MobileBugReportResponseSchema,
        valid: { createdAt: now, ticket: "WSP-24817" },
        invalid: { createdAt: now, ticket: "WSP-2481" },
      },
      MobileInvitePreviewResponseSchema: {
        schema: MobileInvitePreviewResponseSchema,
        valid: { ...invitePreviewProfile, slug: "whispr-community" },
        invalid: { ...invitePreviewProfile, slug: "../admin" },
      },
      MobileReleaseVersionParamsSchema: {
        schema: MobileReleaseVersionParamsSchema,
        valid: { version: "0.8.15" },
        invalid: { version: "" },
      },
      MobileHelpArticleSlugParamsSchema: {
        schema: MobileHelpArticleSlugParamsSchema,
        valid: { slug: "mikrofon-calismiyor" },
        invalid: { slug: "" },
      },
    });
  });

  it("keeps release sizes numeric and the ticket format pinned", () => {
    // The column behind `sizeBytes` is a Prisma BigInt, which does not
    // serialize; the wire contract has to stay a plain number or every detail
    // response throws at `JSON.stringify` time.
    assertRejects(MobileReleaseDetailSchema, { ...releaseDetail, sizeBytes: 49_099_571.5 }, [
      "sizeBytes",
    ]);
    assertAccepts(MobileReleaseDetailSchema, { ...releaseDetail, changes: [] });

    assert.equal(formatBugReportTicket(24_817), "WSP-24817");
    assert.equal(formatBugReportTicket(7), "WSP-00007");
    assertAccepts(MobileBugReportResponseSchema, {
      createdAt: now,
      ticket: formatBugReportTicket(7),
    });
  });

  it("stores device details only behind their own toggle and bounds the log", () => {
    assertAccepts(MobileBugReportRequestSchema, {
      body: "Sesli kanalda mikrofon açıkken kimse duymuyor.",
      category: "voice",
      includesDeviceInfo: false,
      includesLogs: false,
      includesScreenshot: false,
    });
    // "Neler gönderilir?" lists exactly these fields, so an unlisted key from a
    // newer client is a rejection rather than a silent extra column.
    assertRejects(MobileBugReportRequestSchema, { ...bugReport, userEmail: "ada@example.com" });
    assertRejects(
      MobileBugReportRequestSchema,
      { ...bugReport, deviceInfo: { batteryLevel: 42 } },
      ["deviceInfo"],
    );
    assertRejects(MobileBugReportRequestSchema, { ...bugReport, body: "x".repeat(1_001) }, [
      "body",
    ]);
    assertRejects(
      MobileBugReportRequestSchema,
      { ...bugReport, includesScreenshot: true, screenshotUploadKey: "javascript:alert(1)" },
      ["screenshotUploadKey"],
    );
  });

  it("enforces bootstrap feature and session token boundaries", () => {
    assertAccepts(MobileBootstrapFeatureSchema, {
      label: "l".repeat(80),
      reason: "r".repeat(240),
      status: "requires-native-permission",
    });
    assertRejects(MobileBootstrapFeatureSchema, { label: "", status: "available" }, ["label"]);
    assertRejects(
      MobileBootstrapFeatureSchema,
      { label: "Voice", reason: "r".repeat(241), status: "available" },
      ["reason"],
    );

    assertAccepts(MobileSessionTokensSchema, {
      ...sessionTokens,
      accessToken: "a".repeat(8192),
      refreshToken: null,
      scopes: Array.from({ length: 50 }, (_, index) => `scope-${index}`),
    });
    assertRejects(MobileSessionTokensSchema, { ...sessionTokens, accessToken: "a".repeat(15) }, [
      "accessToken",
    ]);
    assertRejects(MobileSessionTokensSchema, { ...sessionTokens, accessToken: "a".repeat(8193) }, [
      "accessToken",
    ]);
    assertRejects(MobileSessionTokensSchema, { ...sessionTokens, issuedAt: Number.NaN }, [
      "issuedAt",
    ]);
    assertRejects(
      MobileSessionTokensSchema,
      { ...sessionTokens, scopes: Array.from({ length: 51 }, () => "scope") },
      ["scopes"],
    );
    assertRejects(MobileSessionTokensSchema, { ...sessionTokens, scopes: ["s".repeat(81)] }, [
      "scopes",
      0,
    ]);
  });

  it("enforces mobile auth token, email, password, and registration refinements", () => {
    assertAccepts(MobileAuthExchangeRequestSchema, {
      callbackPath: "c".repeat(512),
      handoffToken: "A-_1".repeat(32),
    });
    assertRejects(
      MobileAuthExchangeRequestSchema,
      { callbackPath: "", handoffToken: "a".repeat(32) },
      ["callbackPath"],
    );
    assertRejects(
      MobileAuthExchangeRequestSchema,
      { callbackPath: "/callback", handoffToken: "a".repeat(129) },
      ["handoffToken"],
    );
    assertRejects(
      MobileAuthExchangeRequestSchema,
      { callbackPath: "/callback", handoffToken: `${"a".repeat(31)}!` },
      ["handoffToken"],
    );

    assertAccepts(MobileAuthPasswordLoginRequestSchema, {
      email: `${"a".repeat(242)}@example.com`,
      password: "p".repeat(100),
    });
    assertRejects(
      MobileAuthPasswordLoginRequestSchema,
      {
        email: `${"a".repeat(243)}@example.com`,
        password: "password",
      },
      ["email"],
    );
    assertRejects(
      MobileAuthPasswordLoginRequestSchema,
      {
        email: "ada@example.com",
        password: "p".repeat(101),
      },
      ["password"],
    );

    const parsedLogin = assertAccepts(MobileAuthPasswordLoginRequestSchema, {
      email: "ada@example.com",
      password: "password",
      twoFactorCode: `  ${"2".repeat(64)}  `,
    });
    assert.equal(parsedLogin?.twoFactorCode, "2".repeat(64));
    assertRejects(
      MobileAuthPasswordLoginRequestSchema,
      {
        email: "ada@example.com",
        password: "password",
        twoFactorCode: "   ",
      },
      ["twoFactorCode"],
    );
    assertRejects(
      MobileAuthPasswordLoginRequestSchema,
      {
        email: "ada@example.com",
        password: "password",
        twoFactorCode: "2".repeat(65),
      },
      ["twoFactorCode"],
    );

    const registration = {
      confirmPassword: "password",
      email: "ada@example.com",
      password: "password",
      username: "ada_1",
    };
    assertAccepts(MobileAuthRegisterRequestSchema, registration);
    assertAccepts(MobileAuthRegisterRequestSchema, {
      ...registration,
      confirmPassword: "🙂".repeat(18),
      password: "🙂".repeat(18),
    });
    assertRejects(
      MobileAuthRegisterRequestSchema,
      {
        ...registration,
        confirmPassword: "p".repeat(73),
        password: "p".repeat(73),
      },
      ["password"],
    );
    assertRejects(
      MobileAuthRegisterRequestSchema,
      {
        ...registration,
        confirmPassword: "🙂".repeat(19),
        password: "🙂".repeat(19),
      },
      ["password"],
    );
    assertRejects(
      MobileAuthRegisterRequestSchema,
      { ...registration, confirmPassword: "different" },
      ["confirmPassword"],
    );
    assertRejects(MobileAuthRegisterRequestSchema, { ...registration, username: "a" }, [
      "username",
    ]);
    assertRejects(MobileAuthRegisterRequestSchema, { ...registration, username: "u".repeat(33) }, [
      "username",
    ]);
    assertRejects(MobileAuthRegisterRequestSchema, { ...registration, username: "ada-name" }, [
      "username",
    ]);

    assertAccepts(MobileAuthForgotPasswordResponseSchema, {
      email: "ada@example.com",
      message: "Accepted",
      resetLinkTtlMinutes: 1,
      status: "accepted",
    });
    assertRejects(
      MobileAuthForgotPasswordResponseSchema,
      {
        email: "ada@example.com",
        message: "Accepted",
        resetLinkTtlMinutes: 0,
        status: "accepted",
      },
      ["resetLinkTtlMinutes"],
    );
    assertRejects(
      MobileAuthForgotPasswordResponseSchema,
      {
        email: "ada@example.com",
        message: "Accepted",
        resetLinkTtlMinutes: 1.5,
        status: "accepted",
      },
      ["resetLinkTtlMinutes"],
    );
  });

  it("trims and validates Expo push tokens and rejects unknown strict fields", () => {
    const parsed = assertAccepts(MobilePushRegistrationRequestSchema, {
      platform: "android",
      provider: "expo",
      token: "  ExponentPushToken[abcdefghij]  ",
    });
    assert.equal(parsed?.token, "ExponentPushToken[abcdefghij]");
    assertRejects(
      MobilePushRegistrationRequestSchema,
      { platform: "android", provider: "expo", token: "ExpoPushToken[short]" },
      ["token"],
    );
    assertRejects(MobilePushRegistrationRequestSchema, {
      extra: true,
      platform: "android",
      provider: "expo",
      token: "ExpoPushToken[abcdefghij]",
    });
  });

  it("validates a bounded mobile notification feed and rejects malformed payloads", () => {
    const notification = {
      actionUrl: "/channels/server-1/channel-1",
      actor: { avatarUrl: null, displayName: "Ada", id: "user-2", username: "ada" },
      body: "Ada mentioned you",
      channel: { id: "channel-1", name: "general" },
      createdAt: now,
      id: uuid,
      messageQuote: { id: "message-1", preview: "Please review this" },
      read: false,
      readAt: null,
      server: { id: "server-1", name: "Whispr" },
      type: "MENTION",
    };

    assertAccepts(MobileNotificationItemSchema, notification);
    assertRejects(MobileNotificationItemSchema, { ...notification, type: "UNKNOWN" }, ["type"]);
    assertRejects(
      MobileNotificationItemSchema,
      { ...notification, actionUrl: "https://evil.test" },
      ["actionUrl"],
    );
    assertRejects(MobileNotificationItemSchema, { ...notification, actionUrl: "//evil.test" }, [
      "actionUrl",
    ]);
    assertAccepts(MobileNotificationsQuerySchema, { cursor: "opaque-cursor", limit: "20" });
    assertRejects(MobileNotificationsQuerySchema, { limit: 31 }, ["limit"]);
    assertRejects(MobileNotificationsResponseSchema, {
      nextCursor: null,
      notifications: [{ ...notification, readAt: "not-a-date" }],
    });
    assertAccepts(MobileNotificationMutationResponseSchema, { success: true });
  });

  it("enforces strict voice request UUIDs, identifiers, and collection limits", () => {
    assertAccepts(MobileVoiceTokenRequestSchema, { conversationId: "conversation-1" });
    assertRejects(MobileVoiceTokenRequestSchema, {});
    assertRejects(MobileVoiceTokenRequestSchema, {
      channelId: "channel-1",
      conversationId: "conversation-1",
    });
    assertAccepts(MobileVoiceTokenResponseSchema, {
      conversationId: "conversation-1",
      mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" },
      provider: "livekit",
      token: "t".repeat(16),
      url: "wss://livekit.example.com",
    });
    assertRejects(MobileVoiceTokenResponseSchema, {
      provider: "livekit",
      token: "t".repeat(16),
      url: "wss://livekit.example.com",
    });
    assertRejects(MobileVoiceTokenResponseSchema, {
      channelId: "channel-1",
      conversationId: "conversation-1",
      provider: "livekit",
      token: "t".repeat(16),
      url: "wss://livekit.example.com",
    });
    assertRejects(MobileVoiceTokenRequestSchema, { channelId: "channel-1", extra: true });
    assertRejects(MobileVoiceStateDeleteRequestSchema, { extra: true, sessionId: uuid });
    assertRejects(MobileVoiceHeartbeatRequestSchema, { extra: true, sessionId: uuid });
    assertRejects(MobileVoiceStatesQuerySchema, { extra: true, serverId: "server-1" });
    assertRejects(MobileVoiceStateUpsertRequestSchema, {
      channelId: "channel-1",
      extra: true,
      serverId: "server-1",
      sessionId: uuid,
    });
    assertRejects(
      MobileVoiceChannelStateSchema,
      { ...voiceState, participants: Array.from({ length: 51 }, () => voiceParticipant) },
      ["participants"],
    );
    assertRejects(
      MobileVoiceStatesResponseSchema,
      { states: Array.from({ length: 81 }, () => voiceState) },
      ["states"],
    );
    assertRejects(
      MobileVoiceStateParticipantSchema,
      { ...voiceParticipant, username: "u".repeat(81) },
      ["username"],
    );
  });

  it("applies bootstrap defaults and enforces home collection limits", () => {
    const parsed = assertAccepts(MobileBootstrapPayloadSchema, bootstrapPayload);
    assert.deepEqual(parsed?.features.attachments, MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT);
    assert.deepEqual(parsed?.features.invites, MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT);
    assert.equal(parsed?.features.invites.status, "available");
    assert.deepEqual(
      parsed?.features.messageSearch,
      MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT,
    );
    assertRejects(
      MobileBootstrapPayloadSchema,
      {
        ...bootstrapPayload,
        home: {
          ...bootstrapPayload.home,
          directMessages: {
            ...bootstrapPayload.home.directMessages,
            recent: Array.from({ length: 6 }, () => bootstrapConversation),
          },
        },
      },
      ["home", "directMessages", "recent"],
    );
    assertRejects(
      MobileBootstrapPayloadSchema,
      {
        ...bootstrapPayload,
        home: {
          ...bootstrapPayload.home,
          servers: {
            ...bootstrapPayload.home.servers,
            recent: Array.from({ length: 51 }, () => bootstrapServer),
          },
        },
      },
      ["home", "servers", "recent"],
    );
  });

  // 6c reads the three preferences and the invite address straight off the
  // server list, so a device on an older build — whose stored payload predates
  // all four — still has to hydrate rather than throw.
  it("defaults the 6c server preferences so a pre-6c bootstrap payload still parses", () => {
    const parsed = assertAccepts(MobileBootstrapServerSummarySchema, bootstrapServer);

    assert.equal(parsed?.starred, false);
    assert.equal(parsed?.muted, false);
    assert.equal(parsed?.notificationLevel, "all");
    assert.equal(parsed?.inviteAddress, null);

    const explicit = assertAccepts(MobileBootstrapServerSummarySchema, {
      ...bootstrapServer,
      inviteAddress: "whispr.gg/mobile-test",
      muted: true,
      notificationLevel: "mentions",
      starred: true,
    });

    assert.equal(explicit?.starred, true);
    assert.equal(explicit?.muted, true);
    assert.equal(explicit?.notificationLevel, "mentions");
    assert.equal(explicit?.inviteAddress, "whispr.gg/mobile-test");

    assertRejects(
      MobileBootstrapServerSummarySchema,
      { ...bootstrapServer, notificationLevel: "everything" },
      ["notificationLevel"],
    );
  });

  it("requires mobile message content or attachments and enforces transport limits", () => {
    for (const schema of [
      MobileDMSendMessageRequestSchema,
      MobileChannelSendMessageRequestSchema,
    ]) {
      assertAccepts(schema, { content: "x".repeat(2_000) });
      assertAccepts(schema, { attachments: [uploadedAttachment], content: "   " });
      assertRejects(schema, { attachments: [], content: "   " }, ["content"]);
      assertRejects(schema, { content: "x".repeat(2_001) }, ["content"]);
      assertRejects(
        schema,
        { attachments: Array.from({ length: 6 }, () => uploadedAttachment), content: "Hello" },
        ["attachments"],
      );
      assertRejects(schema, { content: "Hello", replyToId: "" }, ["replyToId"]);
      assertRejects(schema, { content: "Hello", threadParentId: "t".repeat(129) }, [
        "threadParentId",
      ]);
    }
  });

  it("enforces mobile workspace nesting and message collection limits", () => {
    assertRejects(
      MobileWorkspaceCategorySummarySchema,
      { ...workspaceCategory, channels: Array.from({ length: 41 }, () => workspaceChannel) },
      ["channels"],
    );
    assertRejects(
      MobileWorkspaceServerDetailSchema,
      { ...workspaceDetail, categories: Array.from({ length: 21 }, () => workspaceCategory) },
      ["categories"],
    );
    assertRejects(
      MobileWorkspaceServerDetailSchema,
      { ...workspaceDetail, ungroupedChannels: Array.from({ length: 81 }, () => workspaceChannel) },
      ["ungroupedChannels"],
    );
    assertRejects(
      MobileDMMessagesResponseSchema,
      {
        conversation: dmConversation,
        messages: Array.from({ length: 31 }, () => dmMessage),
        nextCursor: null,
      },
      ["messages"],
    );
    assertRejects(
      MobileChannelMessagesResponseSchema,
      {
        channel: workspaceChannel,
        hasMore: false,
        messages: Array.from({ length: 31 }, () => chatMessage),
        nextCursor: null,
      },
      ["messages"],
    );
  });

  it("keeps DM participant read states optional and accepts every returned participant", () => {
    assertAccepts(MobileDMParticipantReadStateSchema, {
      lastReadAt: null,
      userId: "user-1",
    });
    assertAccepts(MobileDMMessagesResponseSchema, {
      conversation: dmConversation,
      messages: [dmMessage],
      nextCursor: null,
    });
    assertAccepts(MobileDMMessagesResponseSchema, {
      conversation: dmConversation,
      messages: [dmMessage],
      nextCursor: null,
      participantReadStates: Array.from({ length: 9 }, (_, index) => ({
        lastReadAt: index % 2 === 0 ? now : null,
        userId: `user-${index + 1}`,
      })),
    });
  });
});

/**
 * The preview used to be a hand-written projection of thirteen profile fields.
 * Spreading the whole read model into it (Faz 1 §B6.5) is what lets one screen
 * body serve both routes -- but it also removed the boundary that used to make
 * widening the payload a deliberate act. Someone holding an invite code to a
 * *private* server is the audience here, so this locks the key set: adding a
 * field to `ServerPublicProfileSchema` now fails here until the new exposure is
 * looked at and the list is updated on purpose.
 */
describe("mobile invite preview exposure boundary", () => {
  it("answers with exactly the profile read model plus the slug", () => {
    const keys = Object.keys(MobileInvitePreviewResponseSchema.shape).sort();

    assert.deepEqual(keys, [
      "accessLevel",
      "admins",
      "bannerUrl",
      "canManageServer",
      "channelCount",
      "channels",
      "createdAt",
      "description",
      "discoverable",
      // Reviewed exposure: a boolean saying the channel list this same payload
      // already carries was cut at `MAX_PROFILE_CHANNELS`. It describes the
      // truncation, not what was truncated, so an invite holder learns nothing
      // the visible list did not already tell them.
      "hasMoreChannels",
      "iconUrl",
      "inviteAddress",
      "isPublic",
      "joined",
      "joinedAt",
      "memberCount",
      "muted",
      "mutualFriendCount",
      "mutualFriends",
      "name",
      "notificationLevel",
      "onlineCount",
      "serverId",
      "shortName",
      "slug",
      "starred",
      "tags",
      "type",
      "upcomingEvent",
      "verified",
      "voiceActiveCount",
      "weeklyMessageCount",
    ]);
  });

  it("adds nothing to the profile read model except the slug", () => {
    const previewKeys = new Set(Object.keys(MobileInvitePreviewResponseSchema.shape));
    const profileKeys = Object.keys(ServerPublicProfileSchema.shape);

    for (const key of profileKeys) {
      assert.equal(previewKeys.has(key), true, `preview dropped ${key}`);
      previewKeys.delete(key);
    }

    assert.deepEqual([...previewKeys], ["slug"]);
  });
});
