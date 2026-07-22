import { z } from "zod";
import {
  ChatMessageSchema,
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MESSAGE_CONTENT_HARD_LIMIT,
  MessageReactionSchema,
  MessagesResponseSchema,
  UploadedAttachmentInputSchema,
} from "./messages";
import { DMConversationDTOSchema, DMMessagePayloadSchema } from "./socket";
import { WorkspaceChannelSchema, WorkspaceMemberSchema } from "./workspace";

export const MobileBootstrapFeatureStatusSchema = z.enum([
  "available",
  "disabled",
  "requires-native-permission",
  "requires-server-contract",
]);

export const MobileBootstrapFeatureSchema = z.object({
  label: z.string().min(1).max(80),
  reason: z.string().min(1).max(240).optional(),
  status: MobileBootstrapFeatureStatusSchema,
});

export const MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT = {
  label: "Attachments",
  reason:
    "Mobile can prepare local file selection, but native binary upload transport is gated until the mobile upload provider contract is complete.",
  status: "requires-server-contract",
} as const;

export const MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT = {
  label: "Invites",
  reason: "Authenticated mobile create/join and canonical invite sharing are available.",
  status: "available",
} as const;

export const MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT = {
  label: "Message search",
  reason:
    "Mobile message search waits until authenticated channel and direct-message search endpoints are advertised by the backend.",
  status: "requires-server-contract",
} as const;

export const MobileBootstrapDeepLinkIntentSchema = z.enum(["auth-handoff", "invite", "route"]);

export const MobileBootstrapPermissionIntentSchema = z.enum([
  "camera",
  "microphone",
  "notifications",
  "photoLibrary",
  "screenCapture",
]);

export const MobileSessionSchemaVersionSchema = z.literal(1);

export const MobileSessionUserSchema = z.object({
  avatarUrl: z.string().url().nullable(),
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1),
  username: z.string().min(1).max(80),
});

export const MobileSessionTokensSchema = z.object({
  accessToken: z.string().min(16).max(8192).regex(/^\S+$/),
  expiresAt: z.number().finite(),
  issuedAt: z.number().finite(),
  refreshToken: z.string().min(16).max(8192).regex(/^\S+$/).nullable(),
  scopes: z.array(z.string().min(1).max(80)).max(50),
  tokenType: z.literal("Bearer"),
});

export const MobileSessionSnapshotSchema = z.object({
  lastValidatedAt: z.number().finite(),
  schemaVersion: MobileSessionSchemaVersionSchema,
  tokens: MobileSessionTokensSchema,
  user: MobileSessionUserSchema,
});

export const MobileAuthExchangeRequestSchema = z.object({
  callbackPath: z.string().min(1).max(512),
  handoffToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export const MobileAuthExchangeResponseSchema = z.object({
  session: MobileSessionSnapshotSchema,
});

export const MobileAuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(16).max(8192).regex(/^\S+$/),
});

export const MobileAuthRefreshResponseSchema = z.object({
  session: MobileSessionSnapshotSchema,
});

export const MobileAuthRevokeRequestSchema = z.object({
  refreshToken: z.string().min(16).max(8192).regex(/^\S+$/).nullable().optional(),
});

const MobileAuthEmailSchema = z.string().email("validation.email.invalid").max(254);
const MobileAuthPasswordSchema = z
  .string()
  .min(8, "validation.password.min")
  .max(100, "validation.password.max");
const MobileAuthLocaleSchema = z.enum(["tr", "en"]).optional();

export const MobileAuthPasswordLoginRequestSchema = z.object({
  email: MobileAuthEmailSchema,
  password: MobileAuthPasswordSchema,
  twoFactorCode: z.string().trim().min(1).max(64).optional(),
});

export const MobileAuthPasswordLoginResponseSchema = z.object({
  session: MobileSessionSnapshotSchema,
});

/**
 * Native Google sign-in: the device runs the Google account sheet and only the
 * resulting ID token (a compact JWS) reaches the API, which verifies it against
 * Google's JWKS before minting a Whispr session.
 */
export const MobileAuthGoogleLoginRequestSchema = z.object({
  idToken: z
    .string()
    .min(64)
    .max(8192)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  locale: MobileAuthLocaleSchema,
});

export const MobileAuthGoogleLoginResponseSchema = z.object({
  session: MobileSessionSnapshotSchema,
});

export const MobileAuthRegisterRequestSchema = z
  .object({
    confirmPassword: z.string().max(100, "validation.password.max"),
    email: MobileAuthEmailSchema,
    locale: MobileAuthLocaleSchema,
    password: MobileAuthPasswordSchema,
    username: z
      .string()
      .min(2, "validation.username.min")
      .max(32, "validation.username.max")
      .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern"),
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  });

export const MobileAuthRegisterResponseSchema = z.object({
  email: MobileAuthEmailSchema,
  message: z.string().min(1).max(160),
  status: z.literal("verification-required"),
});

export const MobileAuthForgotPasswordRequestSchema = z.object({
  email: MobileAuthEmailSchema,
  locale: MobileAuthLocaleSchema,
});

export const MobileAuthForgotPasswordResponseSchema = z.object({
  email: MobileAuthEmailSchema,
  message: z.string().min(1).max(160),
  resetLinkTtlMinutes: z.number().int().positive().optional(),
  status: z.literal("accepted"),
});

export const MobileAuthVerificationEmailRequestSchema = z.object({
  email: MobileAuthEmailSchema,
  locale: MobileAuthLocaleSchema,
});

export const MobileAuthVerificationEmailResponseSchema = z.object({
  email: MobileAuthEmailSchema,
  message: z.string().min(1).max(160),
  status: z.literal("accepted"),
});

export const MobilePushProviderSchema = z.literal("expo");

export const MobilePushPlatformSchema = z.enum(["android", "ios"]);

const MobileExpoPushTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,256}\]$/);

export const MobilePushRegistrationRequestSchema = z
  .object({
    platform: MobilePushPlatformSchema,
    provider: MobilePushProviderSchema,
    token: MobileExpoPushTokenSchema,
  })
  .strict();

export const MobilePushRegistrationResponseSchema = z.object({
  provider: MobilePushProviderSchema,
  registered: z.literal(true),
  registeredAt: z.string().datetime(),
  tokenFingerprint: z.string().min(32).max(96),
});

export const MobilePushRegistrationRevokeResponseSchema = z.object({
  revoked: z.boolean(),
  revokedAt: z.string().datetime(),
});

export const MobileNotificationTypeSchema = z.enum([
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "DM",
  "MENTION",
  "MODERATION",
  "SERVER_INVITE",
  "SYSTEM",
]);

export const MobileNotificationEventKindSchema = z.enum([
  "message-reaction",
  "server-member-joined",
  "voice-room-started",
]);

const MobileNotificationActorSchema = z.object({
  avatarUrl: z.string().url().nullable(),
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1).max(128),
  username: z.string().min(1).max(80),
});

const MobileNotificationContextSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120).nullable(),
});

const MobileNotificationMessageQuoteSchema = z.object({
  id: z.string().min(1).max(128),
  preview: z.string().min(1).max(240).nullable(),
});

export const MobileNotificationItemSchema = z.object({
  actionUrl: z
    .string()
    .max(512)
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "A notification action URL must be a safe relative path.",
    })
    .nullable(),
  actor: MobileNotificationActorSchema.nullable(),
  body: z.string().min(1).max(1_000),
  channel: MobileNotificationContextSchema.nullable(),
  createdAt: z.string().datetime(),
  eventKind: MobileNotificationEventKindSchema.nullable().default(null),
  // Added after the UAT backend shipped; must default so an un-redeployed server
  // response still parses.
  friendRequestId: z.string().min(1).max(128).nullable().default(null),
  id: z.string().uuid(),
  messageQuote: MobileNotificationMessageQuoteSchema.nullable(),
  read: z.boolean(),
  readAt: z.string().datetime().nullable(),
  server: MobileNotificationContextSchema.nullable(),
  type: MobileNotificationTypeSchema,
});

export const MOBILE_NOTIFICATION_FILTERS = ["all", "unread", "mentions"] as const;
export const MobileNotificationFilterSchema = z.enum(["all", "mentions", "unread"]);

export const MobileNotificationsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    filter: MobileNotificationFilterSchema.default("all"),
    limit: z.coerce.number().int().min(1).max(30).default(20),
  })
  .strict();

export const MobileNotificationsResponseSchema = z.object({
  nextCursor: z.string().min(1).max(512).nullable(),
  notifications: z.array(MobileNotificationItemSchema).max(30),
  // Added after the UAT backend shipped; must default so an un-redeployed server
  // response still parses.
  unreadCount: z.number().int().min(0).max(9_999).default(0),
});

export const MobileNotificationIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const MobileNotificationMutationResponseSchema = z.object({
  success: z.literal(true),
});

export const MobileVoiceTokenProviderSchema = z.literal("livekit");

export const MobileVoiceTokenRequestSchema = z
  .object({
    channelId: z.string().min(1).max(128).optional(),
    conversationId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((value) => (value.channelId ? !value.conversationId : Boolean(value.conversationId)), {
    message: "Provide exactly one of channelId or conversationId.",
  });

export const MobileVoiceTokenResponseSchema = z
  .object({
    channelId: z.string().min(1).max(128).optional(),
    conversationId: z.string().min(1).max(128).optional(),
    provider: MobileVoiceTokenProviderSchema,
    token: z.string().min(16).max(8192).regex(/^\S+$/),
    url: z.string().min(1).max(512),
  })
  .strict()
  .refine((value) => (value.channelId ? !value.conversationId : Boolean(value.conversationId)), {
    message: "Provide exactly one of channelId or conversationId.",
  });

export const MobileVoiceStateParticipantSchema = z.object({
  avatarUrl: z.string().url().nullable(),
  displayName: z.string().min(1).max(120).nullable(),
  isScreenSharing: z.boolean().default(false),
  userId: z.string().min(1).max(128),
  username: z.string().min(1).max(80),
});

export const MobileVoiceChannelStateSchema = z.object({
  channelId: z.string().min(1).max(128),
  participants: z.array(MobileVoiceStateParticipantSchema).max(50),
});

export const MobileVoiceStatesResponseSchema = z.object({
  states: z.array(MobileVoiceChannelStateSchema).max(80),
});

export const MobileVoiceStateUpdateEventSchema = z.object({
  action: z.enum(["join", "leave"]),
  channelId: z.string().min(1).max(128),
  participants: z.array(MobileVoiceStateParticipantSchema).max(50),
  serverId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
});

export const MobileVoiceScreenShareUpdateEventSchema = z.object({
  channelId: z.string().min(1).max(128),
  isScreenSharing: z.boolean(),
  serverId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
});

export const MobileVoiceStateUpsertRequestSchema = z
  .object({
    channelId: z.string().min(1).max(128),
    serverId: z.string().min(1).max(128),
    sessionId: z.string().uuid(),
  })
  .strict();

export const MobileVoiceStateDeleteRequestSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
  })
  .strict();

export const MobileVoiceHeartbeatRequestSchema = z
  .object({
    selfScreenShare: z.boolean().optional(),
    selfStream: z.boolean().optional(),
    selfVideo: z.boolean().optional(),
    sessionId: z.string().uuid(),
  })
  .strict();

export const MobileVoiceStateMutationResponseSchema = z.object({
  channelId: z.string().min(1).max(128),
  participants: z.array(MobileVoiceStateParticipantSchema).max(50),
  serverId: z.string().min(1).max(128),
  sessionId: z.string().uuid(),
});

export const MobileVoiceStateLeaveResponseSchema = z.object({
  success: z.literal(true),
});

export const MobileVoiceHeartbeatResponseSchema = z.object({
  channelId: z.string().min(1).max(128),
  serverId: z.string().min(1).max(128),
  success: z.literal(true),
});

export const MobileVoiceStatesQuerySchema = z
  .object({
    serverId: z.string().min(1).max(128),
  })
  .strict();

export const MobileBootstrapServerSummarySchema = z.object({
  channelCount: z.number().int().nonnegative(),
  iconUrl: z.string().url().nullable(),
  id: z.string().min(1),
  joinedAt: z.string().datetime(),
  memberCount: z.number().int().nonnegative(),
  mentionCount: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(8).nullable(),
  unreadCount: z.number().int().nonnegative(),
});

export const MobileBootstrapDMParticipantSchema = z.object({
  avatarUrl: z.string().url().nullable(),
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1),
  status: z.string().min(1).max(32).nullable(),
  username: z.string().min(1).max(80),
});

export const MobileBootstrapDMConversationSummarySchema = z.object({
  iconUrl: z.string().url().nullable(),
  id: z.string().min(1),
  lastMessageAt: z.string().datetime(),
  muted: z.boolean(),
  name: z.string().min(1).max(120).nullable(),
  participantCount: z.number().int().nonnegative(),
  participants: z.array(MobileBootstrapDMParticipantSchema).max(4),
  type: z.enum(["DM", "GROUP_DM"]),
  unreadCount: z.number().int().nonnegative(),
});

export const MobileDMConversationPreviewAuthorSchema = z.object({
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1).max(128),
  username: z.string().min(1).max(80),
});

export const MobileDMConversationLastMessagePreviewSchema = z.object({
  author: MobileDMConversationPreviewAuthorSchema,
  authorIsCurrentUser: z.boolean(),
  createdAt: z.string().datetime(),
  id: z.string().min(1).max(128),
  text: z.string().min(1).max(240),
});

export const MobileDMConversationListItemSchema = MobileBootstrapDMConversationSummarySchema.extend(
  {
    lastMessage: MobileDMConversationLastMessagePreviewSchema.nullable(),
  },
);

export const MobileDMConversationsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(30).default(20),
  })
  .strict();

export const MobileDMConversationsResponseSchema = z.object({
  conversations: z.array(MobileDMConversationListItemSchema).max(30),
  nextCursor: z.string().min(1).max(128).nullable(),
  totalUnreadCount: z.number().int().nonnegative(),
});

export const MobileBootstrapPayloadSchema = z.object({
  app: z.object({
    buildId: z.string().min(1),
    name: z.literal("Whispr"),
    releaseChannel: z.string().min(1),
    serverTime: z.string().datetime(),
    version: z.string().min(1),
  }),
  contracts: z.object({
    deepLinks: z.array(MobileBootstrapDeepLinkIntentSchema).min(1),
    permissions: z.array(MobileBootstrapPermissionIntentSchema).min(1),
  }),
  features: z.object({
    attachments: MobileBootstrapFeatureSchema.default(MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT),
    invites: MobileBootstrapFeatureSchema.default(MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT),
    messageSearch: MobileBootstrapFeatureSchema.default(
      MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT,
    ),
    messages: MobileBootstrapFeatureSchema,
    nativeAuthTokenExchange: MobileBootstrapFeatureSchema,
    pushNotifications: MobileBootstrapFeatureSchema,
    voice: MobileBootstrapFeatureSchema,
  }),
  home: z.object({
    directMessages: z.object({
      recent: z.array(MobileBootstrapDMConversationSummarySchema).max(5),
      totalCount: z.number().int().nonnegative(),
      unreadCount: z.number().int().nonnegative(),
    }),
    servers: z.object({
      recent: z.array(MobileBootstrapServerSummarySchema).max(50),
      totalCount: z.number().int().nonnegative(),
    }),
  }),
  user: z.object({
    avatarUrl: z.string().url().nullable(),
    displayName: z.string().min(1).max(120).nullable(),
    id: z.string().min(1),
    locale: z.enum(["tr", "en"]).nullable(),
    status: z.string().min(1).max(32).nullable(),
    username: z.string().min(1).max(80),
  }),
});

export const MobileDMParticipantReadStateSchema = z.object({
  lastReadAt: z.string().datetime().nullable(),
  userId: z.string().min(1).max(128),
});

export const MobileDMMarkReadResponseSchema = z.object({
  conversationId: z.string().min(1).max(128),
  participantReadStates: z.array(MobileDMParticipantReadStateSchema).max(100),
});

export const MobileDMReadUpdatedEventSchema = MobileDMParticipantReadStateSchema.extend({
  conversationId: z.string().min(1).max(128),
});

export const MobileDMCallPeerSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1).max(128),
  username: z.string().min(1).max(80),
});

export const MobileDMCallIncomingEventSchema = z.object({
  conversationId: z.string().min(1).max(128),
  expiresAt: z.string().min(1).max(64),
  fromUser: MobileDMCallPeerSchema,
  video: z.boolean(),
});

export const MobileDMCallSignalEventSchema = z.object({
  conversationId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
});

export const MobileDMCallAcceptedEventSchema = MobileDMCallSignalEventSchema.extend({
  video: z.boolean().default(false),
});

export const MobileDMMessagesResponseSchema = z.object({
  conversation: DMConversationDTOSchema,
  messages: z.array(DMMessagePayloadSchema).max(30),
  nextCursor: z.string().nullable(),
  participantReadStates: z.array(MobileDMParticipantReadStateSchema).optional(),
});

export const MobileMessageReactionRequestSchema = z.object({
  emoji: z.string().trim().min(1).max(64),
});

export const MobileMessageReactionResponseSchema = z.object({
  reactions: z.array(MessageReactionSchema),
});

export const MobileMessageEditRequestSchema = z.object({
  content: z
    .string()
    .max(MESSAGE_CONTENT_HARD_LIMIT)
    .refine((content) => content.trim().length > 0, {
      message: "Message content is required",
    }),
});

export const MobileMessageDeleteResponseSchema = z.union([
  z.object({
    placeholderExpiresAt: z.string().datetime().nullable(),
    status: z.literal("deleted"),
  }),
  z.object({
    status: z.literal("removed"),
  }),
]);

export const MobileDMMessagesThreadResponseSchema = z.object({
  messages: z.array(DMMessagePayloadSchema).max(30),
  nextCursor: z.string().nullable(),
  parent: DMMessagePayloadSchema,
});

const MobileSendMessageRequestSchema = z
  .object({
    alsoSendToChannel: z.boolean().optional(),
    attachments: z.array(UploadedAttachmentInputSchema).max(5).default([]),
    content: z.string().max(MESSAGE_CONTENT_DEFAULT_LIMIT),
    forwardOfMessageId: z.string().min(1).max(128).nullable().optional(),
    replyToId: z.string().min(1).max(128).nullable().optional(),
    threadParentId: z.string().min(1).max(128).nullable().optional(),
  })
  .refine((value) => value.content.trim().length > 0 || value.attachments.length > 0, {
    message: "Message content or attachment is required",
    path: ["content"],
  });

export const MobileDMSendMessageRequestSchema = MobileSendMessageRequestSchema;

export const MobileDMSendMessageResponseSchema = z.object({
  message: DMMessagePayloadSchema,
});

export const MobileChannelLastMessagePreviewAuthorSchema = z.object({
  displayName: z.string().min(1).max(120).nullable(),
  id: z.string().min(1).max(128),
  username: z.string().min(1).max(80),
});

export const MobileChannelLastMessagePreviewSchema = z.object({
  author: MobileChannelLastMessagePreviewAuthorSchema,
  createdAt: z.string().datetime(),
  id: z.string().min(1).max(128),
  text: z.string().min(1).max(240),
});

export const MobileWorkspaceChannelSummarySchema = WorkspaceChannelSchema.pick({
  id: true,
  categoryId: true,
  locked: true,
  mentionCount: true,
  name: true,
  position: true,
  readOnly: true,
  topic: true,
  type: true,
  unreadCount: true,
}).extend({
  categoryName: z.string().min(1).max(120).nullable(),
  lastMessage: MobileChannelLastMessagePreviewSchema.nullable(),
});

export const MobileWorkspaceCategorySummarySchema = z.object({
  channels: z.array(MobileWorkspaceChannelSummarySchema).max(40),
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
});

// Fixed platform-wide attachment ceiling; mirrors the DM attachment size guard
// (`max(25_000_000)`) so the mobile "Maks 25 MB" copy is backend-derived, not
// hardcoded per screen.
export const MOBILE_SERVER_ATTACHMENT_MAX_BYTES = 25_000_000;

export const MobileWorkspaceServerDetailSchema = z.object({
  categories: z.array(MobileWorkspaceCategorySummarySchema).max(20),
  hasMoreChannels: z.boolean(),
  // Empty since the member list moved to `/servers/:id/members`. The field is
  // kept so an older client build still parses a new response, and so a newer
  // build still parses an older response that fills it in.
  members: z.array(WorkspaceMemberSchema).max(80).default([]),
  server: z.object({
    // UAT/web backends may deploy independently of the mobile client. Until the
    // media-settings projection ships, older servers omit these fields; default
    // to the platform-default (CreateServerSchema also defaults both to true) so
    // the strict response parse keeps working instead of failing the whole load.
    allowFileUploads: z.boolean().default(true),
    allowGifs: z.boolean().default(true),
    defaultChannelId: z.string().min(1).nullable(),
    description: z.string().max(240).nullable(),
    iconUrl: z.string().url().nullable(),
    id: z.string().min(1),
    memberCount: z.number().int().nonnegative(),
    mentionCount: z.number().int().nonnegative(),
    name: z.string().min(1).max(120),
    // Older UAT servers may be deployed independently of the mobile client.
    // Defaulting to zero keeps those typed responses usable until the live
    // socket-derived aggregate becomes available after the server rollout.
    onlineMemberCount: z.number().int().nonnegative().default(0),
    // Also independently deployed: older servers omit it, and the client then
    // falls back to scanning `members` for the OWNER row.
    ownerUserId: z.string().min(1).nullable().default(null),
    shortName: z.string().min(1).max(8).nullable(),
    unreadCount: z.number().int().nonnegative(),
    visibleChannelCount: z.number().int().nonnegative(),
  }),
  ungroupedChannels: z.array(MobileWorkspaceChannelSummarySchema).max(80),
});

export const MobileWorkspaceServerDetailResponseSchema = z.object({
  detail: MobileWorkspaceServerDetailSchema,
});

export const MobileChannelMessagesResponseSchema = MessagesResponseSchema.extend({
  channel: MobileWorkspaceChannelSummarySchema,
  messages: z.array(ChatMessageSchema).max(30),
  nextCursor: z.string().nullable(),
});

export const MobileChannelThreadMessagesResponseSchema = z.object({
  hasMore: z.boolean(),
  messages: z.array(ChatMessageSchema).max(30),
  nextCursor: z.string().nullable(),
  parent: ChatMessageSchema,
});

export const MobileChannelSendMessageRequestSchema = MobileSendMessageRequestSchema;

export const MobileChannelMessagePinResponseSchema = z.object({
  message: ChatMessageSchema,
});

export const MobileChannelPinnedMessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema).max(50),
});

export const MobileChannelSendMessageResponseSchema = z.object({
  message: ChatMessageSchema,
});

export const MobileChannelMarkReadResponseSchema = z.object({
  channelId: z.string().min(1).max(128),
  firstUnreadMessageId: z.string().min(1).max(128).nullable(),
  mentionCount: z.number().int().nonnegative(),
  serverId: z.string().min(1).max(128),
  serverMentionCount: z.number().int().nonnegative(),
  serverUnreadCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});

export const MobileServerUnreadUpdateEventSchema = z.object({
  mentionCount: z.number().int().nonnegative(),
  serverId: z.string().min(1).max(128),
  unreadCount: z.number().int().nonnegative(),
});

export const MobileChannelMessagesStaleEventSchema = z.object({
  channelId: z.string().min(1).max(128),
  lastMessage: MobileChannelLastMessagePreviewSchema.nullable().optional(),
  latestMessageId: z.string().min(1).max(128),
  serverId: z.string().min(1).max(128),
});

export type MobileBootstrapFeatureStatus = z.infer<typeof MobileBootstrapFeatureStatusSchema>;
export type MobileBootstrapFeature = z.infer<typeof MobileBootstrapFeatureSchema>;
export type MobileBootstrapServerSummary = z.infer<typeof MobileBootstrapServerSummarySchema>;
export type MobileBootstrapDMParticipant = z.infer<typeof MobileBootstrapDMParticipantSchema>;
export type MobileBootstrapDMConversationSummary = z.infer<
  typeof MobileBootstrapDMConversationSummarySchema
>;
export type MobileDMConversationPreviewAuthor = z.infer<
  typeof MobileDMConversationPreviewAuthorSchema
>;
export type MobileDMConversationLastMessagePreview = z.infer<
  typeof MobileDMConversationLastMessagePreviewSchema
>;
export type MobileDMConversationListItem = z.infer<typeof MobileDMConversationListItemSchema>;
export type MobileDMConversationsQuery = z.infer<typeof MobileDMConversationsQuerySchema>;
export type MobileDMConversationsResponse = z.infer<typeof MobileDMConversationsResponseSchema>;
export type MobileBootstrapPayload = z.infer<typeof MobileBootstrapPayloadSchema>;
export type MobileDMMessagesResponse = z.infer<typeof MobileDMMessagesResponseSchema>;
export type MobileDMParticipantReadState = z.infer<typeof MobileDMParticipantReadStateSchema>;
export type MobileDMMarkReadResponse = z.infer<typeof MobileDMMarkReadResponseSchema>;
export type MobileDMReadUpdatedEvent = z.infer<typeof MobileDMReadUpdatedEventSchema>;
export type MobileDMCallPeer = z.infer<typeof MobileDMCallPeerSchema>;
export type MobileDMCallIncomingEvent = z.infer<typeof MobileDMCallIncomingEventSchema>;
export type MobileDMCallSignalEvent = z.infer<typeof MobileDMCallSignalEventSchema>;
export type MobileDMCallAcceptedEvent = z.infer<typeof MobileDMCallAcceptedEventSchema>;
export type MobileDMMessagesThreadResponse = z.infer<typeof MobileDMMessagesThreadResponseSchema>;
export type MobileDMSendMessageRequest = z.infer<typeof MobileDMSendMessageRequestSchema>;
export type MobileDMSendMessageResponse = z.infer<typeof MobileDMSendMessageResponseSchema>;
export type MobileMessageReactionRequest = z.infer<typeof MobileMessageReactionRequestSchema>;
export type MobileMessageReactionResponse = z.infer<typeof MobileMessageReactionResponseSchema>;
export type MobileMessageEditRequest = z.infer<typeof MobileMessageEditRequestSchema>;
export type MobileMessageDeleteResponse = z.infer<typeof MobileMessageDeleteResponseSchema>;
export type MobileWorkspaceChannelSummary = z.infer<typeof MobileWorkspaceChannelSummarySchema>;
export type MobileChannelLastMessagePreviewAuthor = z.infer<
  typeof MobileChannelLastMessagePreviewAuthorSchema
>;
export type MobileChannelLastMessagePreview = z.infer<typeof MobileChannelLastMessagePreviewSchema>;
export type MobileWorkspaceServerDetail = z.infer<typeof MobileWorkspaceServerDetailSchema>;
export type MobileWorkspaceServerDetailResponse = z.infer<
  typeof MobileWorkspaceServerDetailResponseSchema
>;
export type MobileChannelMessagesResponse = z.infer<typeof MobileChannelMessagesResponseSchema>;
export type MobileChannelThreadMessagesResponse = z.infer<
  typeof MobileChannelThreadMessagesResponseSchema
>;
export type MobileChannelSendMessageRequest = z.infer<typeof MobileChannelSendMessageRequestSchema>;
export type MobileChannelSendMessageResponse = z.infer<
  typeof MobileChannelSendMessageResponseSchema
>;
export type MobileChannelMarkReadResponse = z.infer<typeof MobileChannelMarkReadResponseSchema>;
export type MobileChannelMessagePinResponse = z.infer<
  typeof MobileChannelMessagePinResponseSchema
>;
export type MobileChannelPinnedMessagesResponse = z.infer<
  typeof MobileChannelPinnedMessagesResponseSchema
>;
export type MobileServerUnreadUpdateEvent = z.infer<typeof MobileServerUnreadUpdateEventSchema>;
export type MobileChannelMessagesStaleEvent = z.infer<typeof MobileChannelMessagesStaleEventSchema>;
export type MobileAuthExchangeRequest = z.infer<typeof MobileAuthExchangeRequestSchema>;
export type MobileAuthExchangeResponse = z.infer<typeof MobileAuthExchangeResponseSchema>;
export type MobileAuthRefreshRequest = z.infer<typeof MobileAuthRefreshRequestSchema>;
export type MobileAuthRefreshResponse = z.infer<typeof MobileAuthRefreshResponseSchema>;
export type MobileAuthRevokeRequest = z.infer<typeof MobileAuthRevokeRequestSchema>;
export type MobileAuthPasswordLoginRequest = z.infer<typeof MobileAuthPasswordLoginRequestSchema>;
export type MobileAuthPasswordLoginResponse = z.infer<typeof MobileAuthPasswordLoginResponseSchema>;
export type MobileAuthGoogleLoginRequest = z.infer<typeof MobileAuthGoogleLoginRequestSchema>;
export type MobileAuthGoogleLoginResponse = z.infer<typeof MobileAuthGoogleLoginResponseSchema>;
export type MobileAuthRegisterRequest = z.infer<typeof MobileAuthRegisterRequestSchema>;
export type MobileAuthRegisterResponse = z.infer<typeof MobileAuthRegisterResponseSchema>;
export type MobileAuthForgotPasswordRequest = z.infer<typeof MobileAuthForgotPasswordRequestSchema>;
export type MobileAuthForgotPasswordResponse = z.infer<
  typeof MobileAuthForgotPasswordResponseSchema
>;
export type MobileAuthVerificationEmailRequest = z.infer<
  typeof MobileAuthVerificationEmailRequestSchema
>;
export type MobileAuthVerificationEmailResponse = z.infer<
  typeof MobileAuthVerificationEmailResponseSchema
>;
export type MobileSessionSnapshotPayload = z.infer<typeof MobileSessionSnapshotSchema>;
export type MobilePushProvider = z.infer<typeof MobilePushProviderSchema>;
export type MobilePushPlatform = z.infer<typeof MobilePushPlatformSchema>;
export type MobilePushRegistrationRequest = z.infer<typeof MobilePushRegistrationRequestSchema>;
export type MobilePushRegistrationResponse = z.infer<typeof MobilePushRegistrationResponseSchema>;
export type MobilePushRegistrationRevokeResponse = z.infer<
  typeof MobilePushRegistrationRevokeResponseSchema
>;
export type MobileNotificationType = z.infer<typeof MobileNotificationTypeSchema>;
export type MobileNotificationEventKind = z.infer<typeof MobileNotificationEventKindSchema>;
export type MobileNotificationFilter = z.infer<typeof MobileNotificationFilterSchema>;
export type MobileNotificationItem = z.infer<typeof MobileNotificationItemSchema>;
export type MobileNotificationsQuery = z.infer<typeof MobileNotificationsQuerySchema>;
export type MobileNotificationsResponse = z.infer<typeof MobileNotificationsResponseSchema>;
export type MobileNotificationMutationResponse = z.infer<
  typeof MobileNotificationMutationResponseSchema
>;
export type MobileVoiceTokenProvider = z.infer<typeof MobileVoiceTokenProviderSchema>;
export type MobileVoiceTokenRequest = z.infer<typeof MobileVoiceTokenRequestSchema>;
export type MobileVoiceTokenResponse = z.infer<typeof MobileVoiceTokenResponseSchema>;
export type MobileVoiceStateParticipant = z.infer<typeof MobileVoiceStateParticipantSchema>;
export type MobileVoiceChannelState = z.infer<typeof MobileVoiceChannelStateSchema>;
export type MobileVoiceStatesResponse = z.infer<typeof MobileVoiceStatesResponseSchema>;
export type MobileVoiceStateUpdateEvent = z.infer<typeof MobileVoiceStateUpdateEventSchema>;
export type MobileVoiceScreenShareUpdateEvent = z.infer<
  typeof MobileVoiceScreenShareUpdateEventSchema
>;
export type MobileVoiceStateUpsertRequest = z.infer<typeof MobileVoiceStateUpsertRequestSchema>;
export type MobileVoiceStateDeleteRequest = z.infer<typeof MobileVoiceStateDeleteRequestSchema>;
export type MobileVoiceHeartbeatRequest = z.infer<typeof MobileVoiceHeartbeatRequestSchema>;
export type MobileVoiceStateMutationResponse = z.infer<
  typeof MobileVoiceStateMutationResponseSchema
>;
export type MobileVoiceStateLeaveResponse = z.infer<typeof MobileVoiceStateLeaveResponseSchema>;
export type MobileVoiceHeartbeatResponse = z.infer<typeof MobileVoiceHeartbeatResponseSchema>;
export type MobileVoiceStatesQuery = z.infer<typeof MobileVoiceStatesQuerySchema>;
