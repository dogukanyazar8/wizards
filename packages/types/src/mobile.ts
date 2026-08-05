import { z } from "zod";
import { BadgeIdSchema } from "./badges";
import {
  ChatMessageSchema,
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MESSAGE_CONTENT_HARD_LIMIT,
  MessageReactionSchema,
  MessagesResponseSchema,
  UploadedAttachmentInputSchema,
} from "./messages";
import { isBcryptPasswordWithinLimit } from "./password";
import { DMConversationDTOSchema, DMMessagePayloadSchema } from "./socket";
import { WorkspaceChannelSchema, WorkspaceMemberSchema } from "./workspace";

export const MobileBootstrapFeatureStatusSchema = z.enum(
  ["available", "disabled", "requires-native-permission", "requires-server-contract"],
  { error: "Invalid enum value" },
);

export const MobileBootstrapFeatureSchema = z.object({
  label: z.string().min(1).max(80),
  reason: z.string().min(1).max(240).optional(),
  status: MobileBootstrapFeatureStatusSchema,
});

/**
 * The mobile upload transport is complete: `messageAttachmentUploader` accepts a
 * Bearer token, allows the voice `audio/mp4` type alongside images and
 * documents, and the returned attachment id is claimed by the send routes.
 *
 * This used to advertise `requires-server-contract`, which the DM composer reads
 * as "no attachments" — and that gate also disables the microphone, so voice
 * messages could not be recorded at all.
 */
export const MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT = {
  label: "Attachments",
  reason:
    "Authenticated mobile uploads carry images, documents and voice messages through the shared attachment uploader.",
  status: "available",
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
  username: z.string().min(1, { error: "String must contain at least 1 character" }).max(80),
});

export const MobileSessionTokensSchema = z.object({
  accessToken: z.string().min(16).max(8192).regex(/^\S+$/),
  expiresAt: z.number().finite(),
  issuedAt: z.number().finite(),
  refreshToken: z.string().min(16).max(8192).regex(/^\S+$/).nullable(),
  scopes: z.array(z.string().min(1).max(80)).max(50),
  tokenType: z.literal("Bearer", { error: "Invalid literal value" }),
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
const MobileAuthLoginPasswordSchema = z
  .string()
  .min(8, "validation.password.min")
  .max(100, "validation.password.max");
const MobileAuthNewPasswordSchema = MobileAuthLoginPasswordSchema.refine(
  isBcryptPasswordWithinLimit,
  "validation.password.bcryptMax",
);
const MobileAuthConfirmNewPasswordSchema = z
  .string()
  .max(100, "validation.password.max")
  .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax");
const MobileAuthLocaleSchema = z.enum(["tr", "en"]).optional();

export const MobileAuthPasswordLoginRequestSchema = z.object({
  email: MobileAuthEmailSchema,
  password: MobileAuthLoginPasswordSchema,
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
    confirmPassword: MobileAuthConfirmNewPasswordSchema,
    email: MobileAuthEmailSchema,
    locale: MobileAuthLocaleSchema,
    password: MobileAuthNewPasswordSchema,
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
  /**
   * A badge tier the evaluator just granted (07 §4). It carries its own type
   * rather than riding SYSTEM so the tap can route to "Rozetlerim" without
   * reading metadata, and so muting badge news never mutes a security notice.
   */
  "BADGE",
  "FEEDBACK",
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
  /**
   * Which badge a BADGE row is about, so the tap can open that badge's detail
   * directly. Null on every other type, and defaulted for the same reason the
   * two fields below are: an un-redeployed server must still parse.
   */
  badgeId: BadgeIdSchema.nullable().default(null),
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
  /**
   * Redemption code of a still-open targeted server invite, which is what turns
   * a SERVER_INVITE row into an accept/decline pair. Null once the invite is
   * spent, revoked or expired, so a stale row offers no actions. Defaulted for
   * an un-redeployed server.
   */
  serverInviteCode: z.string().min(1).max(96).nullable().default(null),
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

/**
 * Legal documents are authored once as plain text and served to every surface.
 * The mobile app renders the parsed blocks with its own typography instead of
 * embedding a web view, so the text can be corrected without an app release.
 */
export const MOBILE_LEGAL_DOCUMENT_IDS = ["cookies", "privacy", "terms"] as const;

export const MobileLegalDocumentIdSchema = z.enum(MOBILE_LEGAL_DOCUMENT_IDS);

export const MobileLegalDocumentParamsSchema = z
  .object({ legalDocument: MobileLegalDocumentIdSchema })
  .strict();

export const MobileLegalDocumentBlockSchema = z.object({
  kind: z.enum(["bullet", "heading", "meta", "paragraph", "subheading"]),
  text: z.string().min(1).max(4_000),
});

export const MobileLegalDocumentResponseSchema = z.object({
  badge: z.string().min(1).max(160),
  blocks: z.array(MobileLegalDocumentBlockSchema).max(1_000),
  description: z.string().min(1).max(400),
  id: MobileLegalDocumentIdSchema,
  lastUpdated: z.string().min(1).max(40).nullable(),
  title: z.string().min(1).max(160),
});

/**
 * The `notification:new` socket event. It carries the notification row plus the
 * names and avatars the feed needs, so an open app renders the item from the
 * event itself instead of invalidating and refetching three filtered feeds.
 * Every enrichment is optional: an emitter that cannot resolve the actor still
 * produces a valid event, and the client falls back to a refresh for those.
 */
export const MobileNotificationNewEventSchema = z.object({
  actionUrl: z.string().max(512).nullable().default(null),
  actor: MobileNotificationActorSchema.nullable().optional(),
  body: z.string().min(1).max(2_000),
  channel: z
    .object({ id: z.string().min(1).max(128), name: z.string().min(1).max(120) })
    .nullable()
    .optional(),
  createdAt: z.string().datetime(),
  id: z.string().min(1).max(128),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  read: z.boolean().default(false),
  readAt: z.string().datetime().nullable().default(null),
  server: z
    .object({ id: z.string().min(1).max(128), name: z.string().min(1).max(120) })
    .nullable()
    .optional(),
  type: MobileNotificationTypeSchema,
  userId: z.string().min(1).max(128),
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
  /**
   * Drives the 1a "BOT" badge. Defaulted because the bootstrap payload shipped
   * before the flag existed and an un-redeployed server still has to parse.
   */
  isBot: z.boolean().default(false),
  status: z.string().min(1).max(32).nullable(),
  username: z.string().min(1).max(80),
});

export const MobileBootstrapDMConversationSummarySchema = z.object({
  iconUrl: z.string().url().nullable(),
  id: z.string().min(1),
  lastMessageAt: z.string().datetime(),
  /** 1a mention badge; separate from `unreadCount`, which counts every message. */
  mentionCount: z.number().int().nonnegative().default(0),
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

/**
 * 1a renders "Sesli mesaj · 0:42" instead of the filename for a voice note, so
 * the preview says what the message *is* rather than only what it reads as.
 */
export const MobileDMConversationPreviewKindSchema = z.enum(["text", "voice", "file", "image"]);

/**
 * Tick state of the viewer's own last message: one tick left the server, two
 * grey ticks reached the other device, two accent ticks were read. Null whenever
 * the last message is not the viewer's — an incoming row draws no tick at all.
 */
export const MobileDMConversationPreviewDeliverySchema = z.enum(["sent", "delivered", "read"]);

export const MobileDMConversationLastMessagePreviewSchema = z.object({
  author: MobileDMConversationPreviewAuthorSchema,
  authorIsCurrentUser: z.boolean(),
  createdAt: z.string().datetime(),
  deliveryStatus: MobileDMConversationPreviewDeliverySchema.nullable().default(null),
  /** Voice-note length, seconds. Null for every other preview kind. */
  durationSec: z.number().int().nonnegative().max(86_400).nullable().default(null),
  id: z.string().min(1).max(128),
  kind: MobileDMConversationPreviewKindSchema.default("text"),
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
  /** True when this account may open the mobile moderation queue. */
  isAdmin: z.boolean().default(false),
  /**
   * Server-evaluated feature flags. `features` above is the static capability
   * catalogue; this map is the per-person rollout answer and may change between
   * two bootstraps for the same build.
   */
  flags: z.record(z.string(), z.boolean()).default({}),
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
    // The profile hub renders the viewer's own banner from bootstrap, the same
    // payload it already takes the avatar and name from. Defaulted so a client
    // running against an un-redeployed server still parses.
    bannerColor: z.string().min(1).max(32).nullable().default(null),
    bannerOffsetX: z.number().min(0).max(1).nullable().default(null),
    bannerOffsetY: z.number().min(0).max(1).nullable().default(null),
    bannerUrl: z.string().url().nullable().default(null),
    displayName: z.string().min(1).max(120).nullable(),
    id: z.string().min(1),
    locale: z.enum(["tr", "en"]).nullable(),
    status: z.string().min(1).max(32).nullable(),
    username: z.string().min(1).max(80),
  }),
});

export const MobileDMParticipantReadStateSchema = z.object({
  /**
   * §2 "1a".6.4: the grey two-tick state in a chat bubble. Defaulted rather than
   * required so a client running against an older server still parses.
   */
  lastDeliveredAt: z.string().datetime().nullable().default(null),
  lastReadAt: z.string().datetime().nullable(),
  userId: z.string().min(1).max(128),
});

export const MobileDMMarkReadResponseSchema = z.object({
  conversationId: z.string().min(1).max(128),
  participantReadStates: z.array(MobileDMParticipantReadStateSchema).max(100),
});

/**
 * Deliberately not `MobileDMParticipantReadStateSchema.extend` — the read event
 * says only "this person has read up to here". Delivery travels as its own
 * event, and folding both into one payload would let a read broadcast overwrite
 * a delivery mark it knows nothing about.
 */
export const MobileDMReadUpdatedEventSchema = z.object({
  conversationId: z.string().min(1).max(128),
  lastReadAt: z.string().datetime().nullable(),
  userId: z.string().min(1).max(128),
});

/**
 * "Delivered" is its own event because it happens without the recipient doing
 * anything: their client received the message, or their app pulled the list.
 * It reaches every participant's personal room, so the sender sees the second
 * tick while sitting on the conversation list.
 */
export const MobileDMDeliveredUpdatedEventSchema = z.object({
  conversationId: z.string().min(1).max(128),
  lastDeliveredAt: z.string().datetime().nullable(),
  userId: z.string().min(1).max(128),
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
    /**
     * The id the client's optimistic bubble is already rendered under. The
     * server stores nothing under it — it only hands it back on the author's own
     * copy so the realtime echo can be matched to that bubble instead of landing
     * beside it as a second message.
     */
    clientNonce: z.string().min(1).max(128).optional(),
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
  ungroupedChannels: z
    .array(MobileWorkspaceChannelSummarySchema, { error: "Expected array" })
    .max(80),
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

/* -------------------------------------------- about: releases and updates --- */

/**
 * The "Hakkında" surface: what shipped, what is available, which channel the
 * user is on, whether the service is healthy, the help centre, and the bug
 * report form.
 *
 * Two rules run through all of it. Nothing here carries UI text — the server
 * returns a key and `mobile-copy.ts` owns both languages — and `sizeBytes`
 * crosses the wire as a plain number because the column behind it is a Prisma
 * `BigInt`, which does not serialize.
 */

/** 2b pages twenty at a time; 50 is the ceiling a hand-written cursor may ask for. */
export const MOBILE_RELEASE_PAGE_SIZE = 20;
export const MOBILE_RELEASE_PAGE_MAX_SIZE = 50;
/** §4.10 promises the last 500 lines of log and no more. */
export const MOBILE_BUG_REPORT_LOG_MAX_LINES = 500;
export const MOBILE_BUG_REPORT_BODY_MIN_LENGTH = 20;
export const MOBILE_BUG_REPORT_BODY_MAX_LENGTH = 1_000;
/** 2e shows four tiles: one per help category. */
export const MOBILE_HELP_SEARCH_MIN_LENGTH = 2;
export const MOBILE_HELP_ARTICLE_MAX_COUNT = 50;

const MobileVersionSchema = z.string().min(1).max(32);

export const MobileReleaseChangeTypeSchema = z.enum(["new", "improved", "fixed"]);
export const MobileReleaseChannelSchema = z.enum(["stable", "beta", "uat"]);
export const MobileBuildEnvironmentSchema = z.enum(["development", "uat", "canary", "production"]);
export const MobileUpdatePlatformSchema = z.enum(["android", "ios"]);
export const MobileUpdateKindSchema = z.enum(["ota", "apk", "store", "none"]);
export const MobileAndroidArtifactSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signingCertSha256: z
      .string()
      .regex(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/)
      .optional(),
    sizeBytes: z.number().int().positive(),
    url: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => value.startsWith("https://"), {
        message: "Android update artifacts must use HTTPS.",
      }),
    versionCode: z.number().int().positive(),
  })
  .strict();
/** PROMPT.md §5 `UpdateState`, field for field. */
export const MobileAppUpdateStateSchema = z.enum([
  "current",
  "available",
  "checking",
  "downloading",
  "ready",
  "failed",
]);
export const MobileServiceStatusLevelSchema = z.enum(["ok", "degraded", "down"]);
export const MobileHelpCategorySchema = z.enum(["account", "chat", "media", "server"]);
export const MobileBugReportCategorySchema = z.enum([
  "voice",
  "chat",
  "notification",
  "performance",
  "other",
]);
export const MobileInvitePreviewChannelTypeSchema = z.enum(["text", "voice"]);

export const MobileInvitePreviewChannelSchema = z
  .object({
    liveCount: z.number().int().nonnegative().nullable(),
    name: z.string().min(1).max(100),
    readOnly: z.boolean(),
    type: MobileInvitePreviewChannelTypeSchema,
  })
  .strict();

export const MobileInvitePreviewMutualFriendSchema = z
  .object({
    avatarUrl: z.string().url().max(2048).nullable(),
    displayName: z.string().min(1).max(120),
    id: z.string().min(1).max(128),
  })
  .strict();

/** 2g's authenticated, permission-filtered community invite preview. */
export const MobileInvitePreviewResponseSchema = z
  .object({
    bannerUrl: z.string().url().max(2048).nullable(),
    channels: z.array(MobileInvitePreviewChannelSchema).max(100),
    description: z.string().max(1_000),
    iconUrl: z.string().url().max(2048).nullable(),
    joined: z.boolean(),
    memberCount: z.number().int().nonnegative(),
    mutualFriendCount: z.number().int().nonnegative(),
    mutualFriends: z.array(MobileInvitePreviewMutualFriendSchema).max(8),
    name: z.string().min(1).max(120),
    onlineCount: z.number().int().nonnegative(),
    serverId: z.string().min(1).max(128),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .regex(/^[A-Za-z0-9_-]+$/),
    verified: z.boolean(),
  })
  .strict();

export const MobileReleaseChangeSchema = z
  .object({
    detail: z.string().min(1).max(600).optional(),
    title: z.string().min(1).max(200),
    type: MobileReleaseChangeTypeSchema,
  })
  .strict();

/**
 * One row of 2b and of the 1c history. `changeCount` is served rather than
 * derived: the summary deliberately does not carry `changes`, so the client
 * cannot count them.
 */
export const MobileReleaseSummarySchema = z
  .object({
    changeCount: z.number().int().nonnegative(),
    codename: z.string().min(1).max(48).optional(),
    highlight: z.string().min(1).max(160).optional(),
    /** True for the version the requesting build is running. */
    installed: z.boolean().optional(),
    releasedAt: z.string().datetime(),
    /** True when the user dismissed this version with "Bu sürümü atla". */
    skipped: z.boolean().optional(),
    version: MobileVersionSchema,
  })
  .strict();

export const MobileReleaseDetailSchema = MobileReleaseSummarySchema.extend({
  buildNumber: z.number().int().nonnegative().optional(),
  changes: z.array(MobileReleaseChangeSchema).max(200),
  sizeBytes: z.number().int().nonnegative().optional(),
  summary: z.string().min(1).max(600).optional(),
}).strict();

export const MobileReleaseListResponseSchema = z
  .object({
    nextCursor: z.string().max(128).nullable(),
    releases: z.array(MobileReleaseSummarySchema).max(MOBILE_RELEASE_PAGE_MAX_SIZE),
    /**
     * Every published release, not the page length: 2b prints it in the header
     * badge and in "Tüm sürüm geçmişi (38)", and a paged client cannot count.
     */
    total: z.number().int().nonnegative(),
  })
  .strict();

export const MobileAppUpdateLatestSchema = z
  .object({
    codename: z.string().min(1).max(48).optional(),
    mandatory: z.boolean(),
    releasedAt: z.string().datetime(),
    sizeBytes: z.number().int().nonnegative().optional(),
    version: MobileVersionSchema,
  })
  .strict();

export const MobileAppUpdateResponseSchema = z
  .object({
    androidArtifact: MobileAndroidArtifactSchema.optional(),
    lastCheckedAt: z.string().datetime(),
    latest: MobileAppUpdateLatestSchema.optional(),
    minSupportedVersionCode: z.number().int().positive().optional(),
    /**
     * Whether the server has an OTA distribution configured — not a mirror of
     * the client's `Updates.isEnabled`. It is `false` today because
     * `app.config.js` carries no `updates` key, and the screen says so rather
     * than offering a download it cannot deliver.
     */
    otaEnabled: z.boolean(),
    state: MobileAppUpdateStateSchema,
    updateKind: MobileUpdateKindSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.updateKind === "apk" && value.androidArtifact === undefined) {
      context.addIssue({
        code: "custom",
        message: "APK updates require an Android artifact.",
        path: ["androidArtifact"],
      });
    }
    if (value.updateKind !== "apk" && value.androidArtifact !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Android artifacts are valid only for APK updates.",
        path: ["androidArtifact"],
      });
    }
  });

export const MobileAppChannelRequestSchema = z
  .object({
    channel: MobileReleaseChannelSchema,
    /** 2d beta consent; stored so the sheet is not asked twice. */
    consentAt: z.string().datetime().optional(),
  })
  .strict();

export const MobileAppChannelResponseSchema = z
  .object({
    channel: MobileReleaseChannelSchema,
    /**
     * Always `next-build`: the preference does not move the EAS channel the
     * installed binary was shipped on, and 2c tells the user exactly that.
     */
    effectiveFrom: z.enum(["next-build", "immediate"]),
    requiresRestart: z.boolean(),
  })
  .strict();

/**
 * 1b's service-status row. Level and a link only — the three labels
 * ("Sorunsuz", "Kısmi yavaşlık", "Kesinti") are client copy.
 */
export const MobileServiceStatusResponseSchema = z
  .object({
    checkedAt: z.string().datetime(),
    level: MobileServiceStatusLevelSchema,
    url: z.string().url().max(2048),
  })
  .strict();

export const MobileHelpArticleSchema = z
  .object({
    /** Published body for the in-app reader; null opens the canonical web URL. */
    bodyMarkdown: z.string().trim().min(1).max(200_000).nullable(),
    category: MobileHelpCategorySchema,
    /** True when the article can be read in-app; otherwise `url` is opened. */
    hasBody: z.boolean(),
    id: z.string().min(1).max(128),
    readMinutes: z.number().int().positive(),
    slug: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    url: z.string().url().max(2048),
    views: z.number().int().nonnegative(),
  })
  .strict();

export const MobileHelpCategoryCountSchema = z
  .object({
    articleCount: z.number().int().nonnegative(),
    key: MobileHelpCategorySchema,
  })
  .strict();

export const MobileHelpArticleListResponseSchema = z
  .object({
    articles: z.array(MobileHelpArticleSchema).max(MOBILE_HELP_ARTICLE_MAX_COUNT),
    categories: z.array(MobileHelpCategoryCountSchema).max(4),
  })
  .strict();

/**
 * What 2f sends. The screen lists these fields to the user before submitting,
 * so the schema is `.strict()`: a newer client inventing an extra key must be
 * rejected rather than have it silently stored under a promise that did not
 * mention it.
 */
export const MobileBugReportRequestSchema = z
  .object({
    /** Client build context. Sent regardless of the device-info toggle: a
     * report nobody can pin to a version is not triageable, and a version
     * string is not personal data. */
    appBuild: z.string().min(1).max(32).optional(),
    appVersion: MobileVersionSchema.optional(),
    body: z
      .string()
      .trim()
      .min(MOBILE_BUG_REPORT_BODY_MIN_LENGTH)
      .max(MOBILE_BUG_REPORT_BODY_MAX_LENGTH),
    category: MobileBugReportCategorySchema,
    /** Only stored when `includesDeviceInfo` is true. */
    deviceInfo: z
      .object({
        deviceModel: z.string().min(1).max(120).optional(),
        locale: z.string().min(2).max(16).optional(),
        osName: z.string().min(1).max(40).optional(),
        osVersion: z.string().min(1).max(40).optional(),
      })
      .strict()
      .optional(),
    includesDeviceInfo: z.boolean(),
    includesLogs: z.boolean(),
    includesScreenshot: z.boolean(),
    /** Trimmed to the last 500 lines server-side even if the client sends more. */
    logExcerpt: z.string().max(200_000).optional(),
    platform: z.string().min(1).max(16).optional(),
    releaseChannel: MobileReleaseChannelSchema.optional(),
    /**
     * Key from the existing mobile upload flow. The screenshot rides that
     * lifecycle instead of opening a second, multipart upload path.
     */
    screenshotUploadKey: z.string().min(1).max(256).optional(),
  })
  .strict();

export const MobileBugReportResponseSchema = z
  .object({
    createdAt: z.string().datetime(),
    /** `WSP-#####`, copied to the clipboard by the submission toast. */
    ticket: z.string().regex(/^WSP-\d{5}$/),
  })
  .strict();

export const MobileReleaseVersionParamsSchema = z.object({ version: MobileVersionSchema }).strict();

export const MobileHelpArticleSlugParamsSchema = z
  .object({ slug: z.string().min(1).max(120) })
  .strict();

export const MobileReleaseListQuerySchema = z
  .object({
    cursor: z.string().max(128).optional(),
    /** The build asking, so the server can mark its own row `installed`. */
    installed: MobileVersionSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MOBILE_RELEASE_PAGE_MAX_SIZE)
      .default(MOBILE_RELEASE_PAGE_SIZE),
  })
  .strict();

export const MobileAppUpdateQuerySchema = z
  .object({
    buildEnvironment: MobileBuildEnvironmentSchema.optional(),
    channel: MobileReleaseChannelSchema.optional(),
    installed: MobileVersionSchema.optional(),
    platform: MobileUpdatePlatformSchema.optional(),
    runtimeVersion: z.string().trim().min(1).max(256).optional(),
    versionCode: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const MobileHelpArticleListQuerySchema = z
  .object({
    category: MobileHelpCategorySchema.optional(),
    /** `?popular=1`: the four most-read articles instead of a category page. */
    popular: z.enum(["0", "1"]).optional(),
  })
  .strict();

export const MobileHelpSearchQuerySchema = z
  .object({
    q: z.string().trim().min(MOBILE_HELP_SEARCH_MIN_LENGTH).max(120),
  })
  .strict();

export const MobileHelpArticleViewResponseSchema = z.object({ ok: z.literal(true) }).strict();

export type MobileReleaseChangeType = z.infer<typeof MobileReleaseChangeTypeSchema>;
export type MobileReleaseChannel = z.infer<typeof MobileReleaseChannelSchema>;
export type MobileBuildEnvironment = z.infer<typeof MobileBuildEnvironmentSchema>;
export type MobileUpdatePlatform = z.infer<typeof MobileUpdatePlatformSchema>;
export type MobileUpdateKind = z.infer<typeof MobileUpdateKindSchema>;
export type MobileAndroidArtifact = z.infer<typeof MobileAndroidArtifactSchema>;
export type MobileAppUpdateState = z.infer<typeof MobileAppUpdateStateSchema>;
export type MobileServiceStatusLevel = z.infer<typeof MobileServiceStatusLevelSchema>;
export type MobileHelpCategory = z.infer<typeof MobileHelpCategorySchema>;
export type MobileBugReportCategory = z.infer<typeof MobileBugReportCategorySchema>;
export type MobileReleaseChange = z.infer<typeof MobileReleaseChangeSchema>;
export type MobileReleaseSummary = z.infer<typeof MobileReleaseSummarySchema>;
export type MobileReleaseDetail = z.infer<typeof MobileReleaseDetailSchema>;
export type MobileReleaseListResponse = z.infer<typeof MobileReleaseListResponseSchema>;
export type MobileReleaseListQuery = z.infer<typeof MobileReleaseListQuerySchema>;
export type MobileAppUpdateLatest = z.infer<typeof MobileAppUpdateLatestSchema>;
export type MobileAppUpdateResponse = z.infer<typeof MobileAppUpdateResponseSchema>;
export type MobileAppUpdateQuery = z.infer<typeof MobileAppUpdateQuerySchema>;
export type MobileAppChannelRequest = z.infer<typeof MobileAppChannelRequestSchema>;
export type MobileAppChannelResponse = z.infer<typeof MobileAppChannelResponseSchema>;
export type MobileServiceStatusResponse = z.infer<typeof MobileServiceStatusResponseSchema>;
export type MobileHelpArticle = z.infer<typeof MobileHelpArticleSchema>;
export type MobileHelpCategoryCount = z.infer<typeof MobileHelpCategoryCountSchema>;
export type MobileHelpArticleListResponse = z.infer<typeof MobileHelpArticleListResponseSchema>;
export type MobileHelpArticleListQuery = z.infer<typeof MobileHelpArticleListQuerySchema>;
export type MobileHelpSearchQuery = z.infer<typeof MobileHelpSearchQuerySchema>;
export type MobileHelpArticleViewResponse = z.infer<typeof MobileHelpArticleViewResponseSchema>;
export type MobileBugReportRequest = z.infer<typeof MobileBugReportRequestSchema>;
export type MobileBugReportResponse = z.infer<typeof MobileBugReportResponseSchema>;
export type MobileInvitePreviewChannelType = z.infer<typeof MobileInvitePreviewChannelTypeSchema>;
export type MobileInvitePreviewChannel = z.infer<typeof MobileInvitePreviewChannelSchema>;
export type MobileInvitePreviewMutualFriend = z.infer<typeof MobileInvitePreviewMutualFriendSchema>;
export type MobileInvitePreviewResponse = z.infer<typeof MobileInvitePreviewResponseSchema>;
export type MobileReleaseVersionParams = z.infer<typeof MobileReleaseVersionParamsSchema>;
export type MobileHelpArticleSlugParams = z.infer<typeof MobileHelpArticleSlugParamsSchema>;

/**
 * `WSP-24817`. One formatter so the submission toast, the support console and
 * the row a user quotes back cannot drift into three shapes.
 */
export function formatBugReportTicket(sequence: number): string {
  return `WSP-${String(Math.trunc(Math.abs(sequence)))
    .padStart(5, "0")
    .slice(-5)}`;
}

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
export type MobileDMConversationPreviewKind = z.infer<typeof MobileDMConversationPreviewKindSchema>;
export type MobileDMConversationPreviewDelivery = z.infer<
  typeof MobileDMConversationPreviewDeliverySchema
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
export type MobileDMDeliveredUpdatedEvent = z.infer<typeof MobileDMDeliveredUpdatedEventSchema>;
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
export type MobileChannelMessagePinResponse = z.infer<typeof MobileChannelMessagePinResponseSchema>;
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
export type MobileLegalDocumentId = z.infer<typeof MobileLegalDocumentIdSchema>;
export type MobileLegalDocumentBlock = z.infer<typeof MobileLegalDocumentBlockSchema>;
export type MobileLegalDocumentResponse = z.infer<typeof MobileLegalDocumentResponseSchema>;
export type MobileNotificationType = z.infer<typeof MobileNotificationTypeSchema>;
export type MobileNotificationEventKind = z.infer<typeof MobileNotificationEventKindSchema>;
export type MobileNotificationFilter = z.infer<typeof MobileNotificationFilterSchema>;
export type MobileNotificationItem = z.infer<typeof MobileNotificationItemSchema>;
export type MobileNotificationNewEvent = z.infer<typeof MobileNotificationNewEventSchema>;
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
