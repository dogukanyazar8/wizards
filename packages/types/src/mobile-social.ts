import { z } from "zod";

import { MessageAttachmentSchema } from "./messages";
import { isBcryptPasswordWithinLimit } from "./password";
import { DMConversationDTOSchema } from "./socket";
import { RoleBadgeSchema } from "./workspace";

const MobileBoundedIdSchema = z.string().trim().min(1).max(128);
const MobileHttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");
const MobileGiphyAssetUrlSchema = z.union([
  MobileHttpsUrlSchema,
  z
    .string()
    .max(512)
    .regex(/^data:image\/gif;base64,[A-Za-z0-9+/=]+$/),
]);

export const MobileFriendPresenceStatusSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);
export const MobileFriendStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "BLOCKED"]);

export const MobileFriendUserSchema = z
  .object({
    avatarUrl: z.string().url().max(2048).nullable(),
    displayName: z.string().max(60).nullable(),
    id: MobileBoundedIdSchema,
    username: z.string().min(2).max(32),
  })
  .strict();

export const MobileFriendPresenceSchema = z
  .object({
    customStatus: z.string().max(128).nullable(),
    status: MobileFriendPresenceStatusSchema,
  })
  .strict();

/**
 * 1b shows "live-room · paycore" plus a Join pill for a friend who is sitting in
 * a voice channel right now. Null whenever the friend is not connected.
 */
export const MobileFriendVoiceRoomSchema = z
  .object({
    channelId: MobileBoundedIdSchema,
    channelName: z.string().min(1).max(120),
    serverId: MobileBoundedIdSchema,
    serverName: z.string().min(1).max(120),
  })
  .strict();

/**
 * §2 "1a".5: a friend joining or leaving a voice room, pushed to every friend's
 * personal room. `voice:state:update` only reaches people watching that channel,
 * so the conversations strip would otherwise wait for a friends refetch before
 * swapping the presence dot for the wave tile.
 */
export const MobileFriendVoiceRoomUpdateEventSchema = z
  .object({
    userId: MobileBoundedIdSchema,
    voiceRoom: MobileFriendVoiceRoomSchema.nullable(),
  })
  .strict();

/** 1b device line ("Mobil" / "Masaüstü"); null when no live session says. */
export const MobileFriendDeviceSchema = z.enum(["MOBILE", "DESKTOP", "WEB"]);

export const MobileFriendSchema = MobileFriendUserSchema.extend({
  customStatus: z.string().max(128).nullable(),
  /** 1b: which client the friend is signed in from. */
  device: MobileFriendDeviceSchema.nullable().default(null),
  /**
   * Drives the invite sheet's "2 sa önce görüldü" line. Added after the UAT
   * backend shipped, so it defaults rather than making an older payload fail.
   */
  lastSeenAt: z.string().datetime().nullable().default(null),
  presence: MobileFriendPresenceSchema,
  status: MobileFriendPresenceStatusSchema,
  voiceRoom: MobileFriendVoiceRoomSchema.nullable().default(null),
}).strict();

export const MobileFriendRequestSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: MobileBoundedIdSchema,
    /** 1c secondary line, "4 ortak arkadaş" half. */
    mutualFriendCount: z.number().int().nonnegative().default(0),
    /** 1c secondary line, "2 ortak sunucu · paycore" half. */
    mutualServerCount: z.number().int().nonnegative().default(0),
    mutualServerName: z.string().min(1).max(120).nullable().default(null),
    receiver: MobileFriendUserSchema,
    receiverId: MobileBoundedIdSchema,
    sender: MobileFriendUserSchema,
    senderId: MobileBoundedIdSchema,
    status: MobileFriendStatusSchema,
    updatedAt: z.string().datetime(),
    /** 1c "selin_qa aracılığıyla": a friend both sides already share. */
    viaUsername: z.string().min(2).max(32).nullable().default(null),
  })
  .strict();

export const MobilePendingFriendsSchema = z
  .object({
    incoming: z.array(MobileFriendRequestSchema).max(200),
    outgoing: z.array(MobileFriendRequestSchema).max(200),
  })
  .strict();

export const MobileFriendsOverviewResponseSchema = z
  .object({
    blocked: z.array(MobileFriendUserSchema).max(500),
    friends: z.array(MobileFriendSchema).max(1000),
    pending: MobilePendingFriendsSchema,
  })
  .strict();

export const MobileFriendRequestCreateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/),
  })
  .strict();

export const MobileFriendRequestActionResponseSchema = z
  .object({ request: MobileFriendRequestSchema })
  .strict();
export const MobileFriendMutationResponseSchema = z.object({ success: z.literal(true) }).strict();
export const MobileFriendBlockResponseSchema = z
  .object({ blocked: MobileFriendUserSchema })
  .strict();
export const MobileFriendRequestParamsSchema = z.object({ id: MobileBoundedIdSchema }).strict();
export const MobileFriendUserParamsSchema = z.object({ userId: MobileBoundedIdSchema }).strict();

/** 1c "TANIYOR OLABİLİRSİN" row: a stranger reachable through a shared friend or server. */
export const MOBILE_FRIEND_SUGGESTION_LIMIT = 10;

export const MobileFriendSuggestionSchema = MobileFriendUserSchema.extend({
  mutualFriendCount: z.number().int().nonnegative().default(0),
  mutualServerCount: z.number().int().nonnegative().default(0),
  /** Named server behind "design-guild üyesi"; null when only friends are shared. */
  mutualServerName: z.string().min(1).max(120).nullable().default(null),
}).strict();

export const MobileFriendSuggestionsQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MOBILE_FRIEND_SUGGESTION_LIMIT)
      .optional()
      .default(MOBILE_FRIEND_SUGGESTION_LIMIT),
  })
  .strict();

export const MobileFriendSuggestionsResponseSchema = z
  .object({
    suggestions: z.array(MobileFriendSuggestionSchema).max(MOBILE_FRIEND_SUGGESTION_LIMIT),
  })
  .strict();

/** Viewer-relative state of a searched user, so 9d rows pick the right row action. */
export const MobileFriendRelationshipSchema = z.enum([
  "none",
  "friend",
  "incoming",
  "outgoing",
  "blocked",
]);

export const MOBILE_USER_SEARCH_LIMIT = 20;

export const MobileUserSearchQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MOBILE_USER_SEARCH_LIMIT)
      .optional()
      .default(MOBILE_USER_SEARCH_LIMIT),
    q: z.string().trim().min(2).max(32),
    /**
     * Invite-sheet 2b passes the server it is inviting into, which fills the
     * server-context fields below. Global search omits it and is unchanged.
     */
    serverId: MobileBoundedIdSchema.optional(),
  })
  .strict();

export const MobileUserSearchResultSchema = MobileFriendUserSchema.extend({
  /** Server-context fields: only meaningful when the query carried a `serverId`. */
  isMember: z.boolean().default(false),
  mutualServerCount: z.number().int().nonnegative().default(0),
  /** Targeted invite already waiting for this user on that server, if any. */
  pendingInviteId: MobileBoundedIdSchema.nullable().default(null),
  relationship: MobileFriendRelationshipSchema,
  /** Pending request id for incoming/outgoing rows, so a row can accept or cancel directly. */
  requestId: MobileBoundedIdSchema.nullable(),
}).strict();

export const MobileUserSearchResponseSchema = z
  .object({ results: z.array(MobileUserSearchResultSchema).max(MOBILE_USER_SEARCH_LIMIT) })
  .strict();

export const MobilePresenceUpdateSchema = z
  .object({ status: MobileFriendPresenceStatusSchema })
  .strict();
export const MobilePresenceResponseSchema = z
  .object({ status: MobileFriendPresenceStatusSchema })
  .strict();

/** Contract limits the 2a editor renders its counters and `maxLength` guards from. */
export const MOBILE_PROFILE_BIO_MAX_LENGTH = 500;
export const MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH = 128;
export const MOBILE_PROFILE_CUSTOM_STATUS_EMOJI_MAX_LENGTH = 16;
export const MOBILE_PROFILE_DISPLAY_NAME_MAX_LENGTH = 60;
export const MOBILE_PROFILE_PRONOUNS_MAX_LENGTH = 40;
/** 2a offers exactly these five banner swatches; stored values stay free-form hex. */
export const MOBILE_PROFILE_BANNER_COLORS = [
  "#4F46E5",
  "#22A366",
  "#C77A2B",
  "#8A46C7",
  "#1E2235",
] as const;
export const MOBILE_USERNAME_CHANGE_COOLDOWN_DAYS = 30;
/** Server code a rejected username change carries, so the device can render the cooldown copy. */
export const MOBILE_USERNAME_COOLDOWN_ERROR_CODE = "USERNAME_CHANGE_COOLDOWN";

const MobileProfileBannerColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Hex color required");

/**
 * Normalized banner focal point (CSS `object-position`): 0 is the left/top edge, 1
 * the right/bottom, 0.5 the centre. Stored per axis so "move up/down/left/right"
 * survives a re-open and renders identically on the card and the full page.
 */
const MobileBannerOffsetSchema = z.number().min(0).max(1);

export const MobileProfileUpdateSchema = z
  .object({
    bannerColor: MobileProfileBannerColorSchema.nullable().optional(),
    bannerOffsetX: MobileBannerOffsetSchema.nullable().optional(),
    bannerOffsetY: MobileBannerOffsetSchema.nullable().optional(),
    bannerUrl: MobileHttpsUrlSchema.nullable().optional(),
    bio: z.string().trim().max(MOBILE_PROFILE_BIO_MAX_LENGTH).nullable().optional(),
    customStatus: z
      .string()
      .trim()
      .max(MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH)
      .nullable()
      .optional(),
    customStatusEmoji: z
      .string()
      .trim()
      .max(MOBILE_PROFILE_CUSTOM_STATUS_EMOJI_MAX_LENGTH)
      .nullable()
      .optional(),
    customStatusExpiresAt: z.string().datetime().nullable().optional(),
    displayName: z
      .string()
      .trim()
      .max(MOBILE_PROFILE_DISPLAY_NAME_MAX_LENGTH)
      .nullable()
      .optional(),
    pronouns: z.string().trim().max(MOBILE_PROFILE_PRONOUNS_MAX_LENGTH).nullable().optional(),
    username: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one profile field is required",
  });

/**
 * Profile fields added for the 2a editor. Every one is `.default(null)` so a device
 * running ahead of an un-redeployed server still parses the older payload.
 */
const MobileProfileDecorationShape = {
  bannerColor: MobileProfileBannerColorSchema.nullable().default(null),
  bannerOffsetX: MobileBannerOffsetSchema.nullable().default(null),
  bannerOffsetY: MobileBannerOffsetSchema.nullable().default(null),
  bannerUrl: MobileHttpsUrlSchema.nullable().default(null),
  customStatusEmoji: z
    .string()
    .max(MOBILE_PROFILE_CUSTOM_STATUS_EMOJI_MAX_LENGTH)
    .nullable()
    .default(null),
  customStatusExpiresAt: z.string().datetime().nullable().default(null),
  pronouns: z.string().max(MOBILE_PROFILE_PRONOUNS_MAX_LENGTH).nullable().default(null),
} as const;

export const MobileProfileUserSchema = MobileFriendUserSchema.extend({
  customStatus: z.string().max(MOBILE_PROFILE_CUSTOM_STATUS_MAX_LENGTH).nullable(),
  status: MobileFriendPresenceStatusSchema,
  twoFactorEnabled: z.boolean(),
}).strict();
export const MobileProfileResponseSchema = z
  .object({
    // Only the signed-in user's own profile carries the bio, the 2a decoration fields and
    // the username cooldown; peer-facing payloads keep the narrower user shape.
    user: MobileProfileUserSchema.extend({
      ...MobileProfileDecorationShape,
      bio: z.string().max(MOBILE_PROFILE_BIO_MAX_LENGTH).nullable().default(null),
      /** When the 30-day username cooldown lifts; null while a change is allowed. */
      nextUsernameChangeAt: z.string().datetime().nullable().default(null),
    }),
  })
  .strict();

export const MobileTwoFactorConfirmRequestSchema = z
  .object({ code: z.string().trim().min(6).max(64) })
  .strict();
export const MobileTwoFactorDisableRequestSchema = z
  .object({
    code: z.string().trim().min(6).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();
export const MobileTwoFactorSetupResponseSchema = z
  .object({
    manualEntryKey: z.string().min(8).max(128),
    otpauthUri: z.string().min(16).max(2048).startsWith("otpauth://"),
    qrCodeDataUrl: z
      .string()
      .max(262_144)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();
export const MobileTwoFactorConfirmResponseSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(8).max(64)).min(1).max(20),
  })
  .strict();
export const MobileTwoFactorDisableResponseSchema = z.object({ success: z.literal(true) }).strict();

export const MobilePasswordChangeRequestSchema = z
  .object({
    confirmPassword: z
      .string()
      .min(1)
      .max(100)
      .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax"),
    currentPassword: z.string().min(1).max(256),
    newPassword: z
      .string()
      .min(8)
      .max(100)
      .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax"),
  })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "validation.password.reused",
    path: ["newPassword"],
  });
export const MobilePasswordChangeResponseSchema = z.object({ success: z.literal(true) }).strict();

export const MobileAccountLocaleSchema = z.enum(["en", "tr"]);
export const MobileLocaleUpdateRequestSchema = z
  .object({ locale: MobileAccountLocaleSchema })
  .strict();
export const MobileLocaleUpdateResponseSchema = z
  .object({ locale: MobileAccountLocaleSchema })
  .strict();

export const MobileAccountDmPolicySchema = z.enum([
  "EVERYONE",
  "FRIENDS",
  "MUTUAL_SERVERS",
  "NOBODY",
]);
export const MobileAccountFriendRequestPolicySchema = z.enum([
  "EVERYONE",
  "MUTUAL_SERVERS",
  "MUTUAL_FRIENDS",
  "NOBODY",
]);
/**
 * Message-body appearance (redesign §3), synced so the four-step size slider a
 * person set on one device is the size they get on the next one. Deliberately
 * apart from the interface text scale, which stays device-local.
 */
export const MobileMessageFontSizeSchema = z.enum(["small", "medium", "large", "xlarge"]);
export const MobileAccountAppearanceSchema = z
  .object({
    messageCompact: z.boolean().default(false),
    messageFollowSystemFont: z.boolean().default(false),
    messageFontSize: MobileMessageFontSizeSchema.default("medium"),
  })
  .strict();

export const MOBILE_ACCOUNT_APPEARANCE_DEFAULT = Object.freeze(
  MobileAccountAppearanceSchema.parse({}),
);

export const MobileAccountSettingsResponseSchema = z
  .object({
    /** Added after the UAT backend shipped, so an older response still parses. */
    appearance: MobileAccountAppearanceSchema.default(MOBILE_ACCOUNT_APPEARANCE_DEFAULT),
    account: z
      .object({
        ...MobileProfileDecorationShape,
        bio: z.string().max(1024).nullable(),
        customStatus: z.string().max(128).nullable(),
        email: z.string().email().max(254),
        emailVerified: z.boolean(),
        /** Mirrors the profile payload so 2a can gate the username field on first paint. */
        nextUsernameChangeAt: z.string().datetime().nullable().default(null),
        // Added after the UAT backend shipped; must default so an un-redeployed
        // server response still parses.
        twoFactorEnabled: z.boolean().default(false),
      })
      .strict(),
    privacy: z
      .object({
        dmPermission: MobileAccountDmPolicySchema,
        friendRequests: MobileAccountFriendRequestPolicySchema,
      })
      .strict(),
  })
  .strict();
export const MobileAccountSettingsUpdateSchema = z
  .object({
    dmPermission: MobileAccountDmPolicySchema.optional(),
    friendRequests: MobileAccountFriendRequestPolicySchema.optional(),
    // The appearance slider writes on its own, without touching privacy, so
    // every field here is independently optional.
    messageCompact: z.boolean().optional(),
    messageFollowSystemFont: z.boolean().optional(),
    messageFontSize: MobileMessageFontSizeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one settings field is required",
  });

export const MobileGiphySearchQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(36).optional().default(24),
    offset: z.coerce.number().int().min(0).max(4999).optional().default(0),
    q: z.string().trim().max(50).optional().default(""),
  })
  .strict();

export const MobileGiphyGifSchema = z
  .object({
    giphyUrl: MobileHttpsUrlSchema,
    height: z.number().int().positive().nullable(),
    id: MobileBoundedIdSchema,
    previewUrl: MobileGiphyAssetUrlSchema,
    size: z.number().int().positive().max(25_000_000),
    title: z.string().max(120),
    url: MobileGiphyAssetUrlSchema,
    width: z.number().int().positive().nullable(),
  })
  .strict();
export const MobileGiphySearchResponseSchema = z
  .object({ gifs: z.array(MobileGiphyGifSchema).max(36) })
  .strict();

export const MobileGiphyAttachmentRequestSchema = z
  .object({ gifId: MobileBoundedIdSchema })
  .strict();
export const MobileGiphyAttachmentResponseSchema = z
  .object({
    attachment: MessageAttachmentSchema,
    input: z
      .object({
        height: z.number().int().positive().nullable(),
        id: MobileBoundedIdSchema,
        width: z.number().int().positive().nullable(),
      })
      .strict(),
  })
  .strict();

export const MobileLinkPreviewRequestSchema = z.object({ url: MobileHttpsUrlSchema }).strict();
export const MobileLinkPreviewResponseSchema = z
  .object({
    description: z.string().max(280).nullable(),
    imageUrl: MobileHttpsUrlSchema.nullable(),
    siteName: z.string().max(80).nullable(),
    title: z.string().max(160).nullable(),
    url: MobileHttpsUrlSchema,
  })
  .strict();

export const MobileDMDetailsParamsSchema = z
  .object({ conversationId: MobileBoundedIdSchema })
  .strict();
export const MobileDMCreateRequestSchema = z.object({ userId: MobileBoundedIdSchema }).strict();
export const MobileDMCreateResponseSchema = z
  .object({ conversation: DMConversationDTOSchema })
  .strict();
export const MobileDMDetailsQuerySchema = z
  .object({
    cursor: MobileBoundedIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  })
  .strict();
export const MobileDMMutualServerSchema = z
  .object({
    iconUrl: z.string().url().max(2048).nullable(),
    id: MobileBoundedIdSchema,
    memberCount: z.number().int().nonnegative(),
    name: z.string().min(1).max(100),
    shortName: z.string().max(12).nullable(),
  })
  .strict();
export const MobileDMSharedAttachmentSchema = z
  .object({
    attachment: MessageAttachmentSchema,
    messageCreatedAt: z.string().datetime(),
    messageId: MobileBoundedIdSchema,
  })
  .strict();
export const MobileDMGroupMemberSchema = z
  .object({
    avatarUrl: z.string().url().max(2048).nullable(),
    displayName: z.string().max(100).nullable(),
    id: MobileBoundedIdSchema,
    isOwner: z.boolean(),
    status: z.string().max(32),
    username: z.string().max(100),
  })
  .strict();
export const MobileDMDetailsResponseSchema = z
  .object({
    /**
     * Every photo and video in the conversation, not just the ones in
     * `sharedAttachments` — that list is derived from the newest message page,
     * so its length is a page artefact and the 1c header needs the real total.
     */
    mediaCount: z.number().int().nonnegative(),
    /**
     * Populated for a group; empty for a 1:1, where `participant` already is the
     * other side. Ordered by `joinedAt`, same as the conversation payload.
     */
    members: z.array(MobileDMGroupMemberSchema).max(32).default([]),
    mutualServers: z.array(MobileDMMutualServerSchema).max(12),
    nextCursor: MobileBoundedIdSchema.nullable(),
    ownerId: MobileBoundedIdSchema.nullable().default(null),
    /** Null in a group: there is no single counterpart to describe. */
    participant: MobileProfileUserSchema.omit({ twoFactorEnabled: true }).nullable(),
    sharedAttachments: z
      .object({
        files: z.array(MobileDMSharedAttachmentSchema).max(30),
        media: z.array(MobileDMSharedAttachmentSchema).max(30),
      })
      .strict(),
  })
  .strict();

/**
 * 11f shared-media gallery. The `details` summary above stays a fixed 30-item
 * preview; this is the paged full history behind its "see all", split into the
 * three tabs the gallery renders.
 */
export const MobileDMAttachmentsTabSchema = z.enum(["files", "links", "media"]);

/**
 * `limit` counts *messages*, not items, because the cursor is a message id — the
 * same keyset the DM message list pages by. One message carries up to
 * `MESSAGE_ATTACHMENT_MAX_COUNT` attachments, so a page yields between `limit`
 * and `5 * limit` media/file items, and up to `10 * limit` links.
 */
export const MobileDMAttachmentsQuerySchema = z
  .object({
    cursor: MobileBoundedIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(30),
    tab: MobileDMAttachmentsTabSchema.optional().default("media"),
  })
  .strict();

const MobileDMAttachmentItemBaseShape = {
  messageCreatedAt: z.string().datetime(),
  messageId: MobileBoundedIdSchema,
} as const;

export const MobileDMAttachmentItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...MobileDMAttachmentItemBaseShape,
      attachment: MessageAttachmentSchema,
      kind: z.literal("media"),
    })
    .strict(),
  z
    .object({
      ...MobileDMAttachmentItemBaseShape,
      attachment: MessageAttachmentSchema,
      kind: z.literal("file"),
    })
    .strict(),
  z
    .object({
      ...MobileDMAttachmentItemBaseShape,
      /** `${messageId}:${indexInMessage}` — a message may carry several links. */
      id: MobileBoundedIdSchema,
      kind: z.literal("link"),
      url: MobileHttpsUrlSchema,
    })
    .strict(),
]);

export const MobileDMAttachmentsResponseSchema = z
  .object({
    items: z.array(MobileDMAttachmentItemSchema).max(500),
    nextCursor: MobileBoundedIdSchema.nullable(),
    tab: MobileDMAttachmentsTabSchema,
  })
  .strict();

/**
 * Server-derived profile badges (11a). Deterministic from account facts, never
 * stored: `earlyMember` from registeredAt, `supporter` from premiumType,
 * `inviter` from at least one used invite.
 */
export const MobileProfileBadgeSchema = z.enum(["earlyMember", "supporter", "inviter"]);

/**
 * Role chips only exist when the card was opened from a server surface AND both
 * the viewer and the subject are members there — the card renders no role
 * section at all in a DM context.
 */
export const MobileUserProfileServerContextSchema = z
  .object({
    joinedAt: z.string().datetime().nullable(),
    roles: z.array(RoleBadgeSchema).max(50),
    serverId: MobileBoundedIdSchema,
    serverName: z.string().min(1).max(100),
  })
  .strict();

/**
 * The card draws the status emoji beside the message (handoff 1a/2a), which the
 * friends-list presence shape has no room for. Widened here rather than on
 * `MobileFriendPresenceSchema` so the friends payload stays as narrow as it was.
 * Defaulted so an un-redeployed server still parses.
 */
export const MobileUserProfilePresenceSchema = MobileFriendPresenceSchema.extend({
  customStatusEmoji: z
    .string()
    .max(MOBILE_PROFILE_CUSTOM_STATUS_EMOJI_MAX_LENGTH)
    .nullable()
    .default(null),
}).strict();

export const MobileUserProfileMutualsSchema = z
  .object({
    /**
     * Total shared servers, which can exceed `preview`: the 1c header reads
     * "ORTAK SUNUCULAR — N" while the rows are the capped preview.
     */
    count: z.number().int().nonnegative(),
    preview: z.array(MobileDMMutualServerSchema).max(12),
  })
  .strict();

export const MobileUserProfileMutualFriendsSchema = z
  .object({
    count: z.number().int().nonnegative(),
    preview: z.array(MobileFriendUserSchema).max(12),
  })
  .strict();

/**
 * One request feeds both the quick card (11b) and the full page (11c). Fields the
 * viewer may not see are cropped server-side rather than hidden by the client.
 */
export const MobileUserProfileSchema = z
  .object({
    badges: z.array(MobileProfileBadgeSchema).max(8),
    bannerColor: z.string().max(32).nullable(),
    bannerOffsetX: MobileBannerOffsetSchema.nullable().default(null),
    bannerOffsetY: MobileBannerOffsetSchema.nullable().default(null),
    bannerUrl: z.string().url().max(2048).nullable(),
    bio: z.string().max(500).nullable(),
    /** The viewer blocked this user; the card falls back to its restricted view. */
    blocked: z.boolean(),
    /** This user blocked the viewer; identity only, everything else is cropped. */
    blockedBy: z.boolean(),
    mutualFriends: MobileUserProfileMutualFriendsSchema,
    mutualServers: MobileUserProfileMutualsSchema,
    /** Viewer-private note (11e writes it); always null for your own card. */
    note: z.string().max(256).nullable(),
    presence: MobileUserProfilePresenceSchema,
    pronouns: z.string().max(40).nullable(),
    registeredAt: z.string().datetime(),
    relationship: MobileFriendRelationshipSchema,
    /** True when the requested id is the signed-in user, which selects the 1d card. */
    self: z.boolean(),
    serverContext: MobileUserProfileServerContextSchema.nullable(),
    user: MobileFriendUserSchema,
  })
  .strict();

export const MobileUserProfileResponseSchema = z
  .object({ profile: MobileUserProfileSchema })
  .strict();

export const MobileUserProfileQuerySchema = z
  .object({ serverId: MobileBoundedIdSchema.optional() })
  .strict();

/** Handoff 2b counts against this exact limit ("49/256"); the column matches it. */
export const MOBILE_USER_NOTE_MAX_LENGTH = 256;

/**
 * 11e note write. `null` (or a body that trims to empty) deletes the note — the
 * 2b sheet has no separate delete affordance, clearing the field and saving is
 * the delete, so the contract has to express "no note" rather than "empty note".
 */
export const MobileUserNoteUpdateSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(MOBILE_USER_NOTE_MAX_LENGTH)
      .nullable()
      .transform((value) => (value === null || value.length === 0 ? null : value)),
  })
  .strict();

export const MobileUserNoteResponseSchema = z
  .object({ note: z.string().max(MOBILE_USER_NOTE_MAX_LENGTH).nullable() })
  .strict();

export const MobileUserReportReasonSchema = z.enum([
  "harassment",
  "spam",
  "inappropriate",
  "impersonation",
  "other",
]);

export const MobileUserReportRequestSchema = z
  .object({
    /**
     * Optional evidence pointers. A client that sends none keeps the old
     * profile-report behaviour, so an app released before this field still
     * parses.
     */
    attachmentId: MobileBoundedIdSchema.optional(),
    details: z.string().trim().max(500).nullable().optional(),
    dmMessageId: MobileBoundedIdSchema.optional(),
    messageId: MobileBoundedIdSchema.optional(),
    reason: MobileUserReportReasonSchema,
  })
  .strict();

export const MobileUserReportResponseSchema = z
  .object({ reportId: MobileBoundedIdSchema })
  .strict();

export type MobileFriendRequestCreate = z.infer<typeof MobileFriendRequestCreateSchema>;
export type MobileFriendsOverviewResponse = z.infer<typeof MobileFriendsOverviewResponseSchema>;
export type MobileFriendVoiceRoom = z.infer<typeof MobileFriendVoiceRoomSchema>;
export type MobileFriendVoiceRoomUpdateEvent = z.infer<
  typeof MobileFriendVoiceRoomUpdateEventSchema
>;
export type MobileFriendDevice = z.infer<typeof MobileFriendDeviceSchema>;
export type MobileFriendSuggestion = z.infer<typeof MobileFriendSuggestionSchema>;
export type MobileFriendSuggestionsQuery = z.infer<typeof MobileFriendSuggestionsQuerySchema>;
export type MobileFriendSuggestionsResponse = z.infer<typeof MobileFriendSuggestionsResponseSchema>;
export type MobileFriendRelationship = z.infer<typeof MobileFriendRelationshipSchema>;
export type MobileUserSearchQuery = z.infer<typeof MobileUserSearchQuerySchema>;
export type MobileUserSearchResult = z.infer<typeof MobileUserSearchResultSchema>;
export type MobileUserSearchResponse = z.infer<typeof MobileUserSearchResponseSchema>;
export type MobileFriendPresenceStatus = z.infer<typeof MobileFriendPresenceStatusSchema>;
export type MobileProfileResponse = z.infer<typeof MobileProfileResponseSchema>;
export type MobilePresenceUpdate = z.infer<typeof MobilePresenceUpdateSchema>;
export type MobileProfileUpdate = z.infer<typeof MobileProfileUpdateSchema>;
export type MobileTwoFactorDisableRequest = z.infer<typeof MobileTwoFactorDisableRequestSchema>;
export type MobileTwoFactorConfirmRequest = z.infer<typeof MobileTwoFactorConfirmRequestSchema>;
export type MobileGiphySearchQuery = z.infer<typeof MobileGiphySearchQuerySchema>;
export type MobileGiphyAttachmentRequest = z.infer<typeof MobileGiphyAttachmentRequestSchema>;
export type MobileGiphyAttachmentResponse = z.infer<typeof MobileGiphyAttachmentResponseSchema>;
export type MobileLinkPreviewRequest = z.infer<typeof MobileLinkPreviewRequestSchema>;
export type MobileLinkPreviewResponse = z.infer<typeof MobileLinkPreviewResponseSchema>;
export type MobileDMDetailsQuery = z.infer<typeof MobileDMDetailsQuerySchema>;
export type MobileAccountDmPolicy = z.infer<typeof MobileAccountDmPolicySchema>;
export type MobileAccountFriendRequestPolicy = z.infer<
  typeof MobileAccountFriendRequestPolicySchema
>;
export type MobileAccountLocale = z.infer<typeof MobileAccountLocaleSchema>;
export type MobileLocaleUpdateRequest = z.infer<typeof MobileLocaleUpdateRequestSchema>;
export type MobileLocaleUpdateResponse = z.infer<typeof MobileLocaleUpdateResponseSchema>;
export type MobilePasswordChangeRequest = z.infer<typeof MobilePasswordChangeRequestSchema>;
export type MobilePasswordChangeResponse = z.infer<typeof MobilePasswordChangeResponseSchema>;
export type MobileAccountAppearance = z.infer<typeof MobileAccountAppearanceSchema>;
export type MobileMessageFontSizePreference = z.infer<typeof MobileMessageFontSizeSchema>;
export type MobileAccountSettingsResponse = z.infer<typeof MobileAccountSettingsResponseSchema>;
export type MobileAccountSettingsUpdate = z.infer<typeof MobileAccountSettingsUpdateSchema>;
export type MobileProfileBadge = z.infer<typeof MobileProfileBadgeSchema>;
export type MobileUserProfile = z.infer<typeof MobileUserProfileSchema>;
export type MobileUserProfileResponse = z.infer<typeof MobileUserProfileResponseSchema>;
export type MobileUserProfileQuery = z.infer<typeof MobileUserProfileQuerySchema>;
export type MobileUserProfileServerContext = z.infer<typeof MobileUserProfileServerContextSchema>;
export type MobileUserProfilePresence = z.infer<typeof MobileUserProfilePresenceSchema>;
export type MobileUserReportReason = z.infer<typeof MobileUserReportReasonSchema>;
export type MobileUserReportRequest = z.infer<typeof MobileUserReportRequestSchema>;
export type MobileUserReportResponse = z.infer<typeof MobileUserReportResponseSchema>;
export type MobileUserNoteUpdate = z.infer<typeof MobileUserNoteUpdateSchema>;
export type MobileUserNoteResponse = z.infer<typeof MobileUserNoteResponseSchema>;
export type MobileDMGroupMember = z.infer<typeof MobileDMGroupMemberSchema>;
export type MobileDMDetailsResponse = z.infer<typeof MobileDMDetailsResponseSchema>;
export type MobileDMAttachmentsTab = z.infer<typeof MobileDMAttachmentsTabSchema>;
export type MobileDMAttachmentsQuery = z.infer<typeof MobileDMAttachmentsQuerySchema>;
export type MobileDMAttachmentItem = z.infer<typeof MobileDMAttachmentItemSchema>;
export type MobileDMAttachmentsResponse = z.infer<typeof MobileDMAttachmentsResponseSchema>;
