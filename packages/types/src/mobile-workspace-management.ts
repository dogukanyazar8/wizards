import { z } from "zod";

import { MobileWorkspaceServerDetailResponseSchema } from "./mobile";
import {
  CreateCategorySchema,
  CreateChannelSchema,
  CreateInviteSchema,
  CreateServerSchema,
  DeleteServerSchema,
  ServerScheduledEventSchema,
  ServerUserSettingsSchema,
  UpdateCategorySchema,
  UpdateChannelFieldsSchema,
  UpdateServerFieldsSchema,
  WorkspaceMemberSchema,
} from "./workspace";

const MobileResourceIdSchema = z
  .string()
  .trim()
  .min(1, { error: "String must contain at least 1 character" })
  .max(128);

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const MobileHttpsUrlSchema = z.string().url().max(2048).refine(isHttpsUrl, "HTTPS URL required");

export const MobileMediaUploadPurposeSchema = z.enum([
  "feedback-attachment",
  "profile-avatar",
  "profile-banner",
  "server-icon",
]);
export const MobileMediaUploadContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const MobileMediaUploadIntentSchema = z.discriminatedUnion("purpose", [
  // 4a screenshots: owner-scoped like the profile purposes, and consumed by the
  // feedback submission instead of the generic claim route.
  z.object({ purpose: z.literal("feedback-attachment") }).strict(),
  z.object({ purpose: z.literal("profile-avatar") }).strict(),
  z.object({ purpose: z.literal("profile-banner") }).strict(),
  z
    .object({
      purpose: z.literal("server-icon"),
      targetServerId: MobileResourceIdSchema,
    })
    .strict(),
]);
export const MobileMediaUploadCompletionResponseSchema = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    claimId: MobileResourceIdSchema,
    expiresAt: z.string().datetime(),
    purpose: MobileMediaUploadPurposeSchema,
    targetServerId: MobileResourceIdSchema.nullable(),
  })
  .strict();
export const MobileMediaClaimRequestSchema = z.object({ claimId: MobileResourceIdSchema }).strict();
const MobileMediaClaimProfileSchema = z
  .object({
    avatarUrl: MobileHttpsUrlSchema,
    customStatus: z.string().max(128).nullable(),
    displayName: z.string().max(60).nullable(),
    id: MobileResourceIdSchema,
    status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
    twoFactorEnabled: z.boolean(),
    username: z.string().min(2).max(32),
  })
  .strict();
export const MobileMediaClaimResponseSchema = z.discriminatedUnion("purpose", [
  z
    .object({
      claimId: MobileResourceIdSchema,
      claimedAt: z.string().datetime(),
      profile: MobileMediaClaimProfileSchema,
      purpose: z.literal("profile-avatar"),
    })
    .strict(),
  z
    .object({
      // A banner claim only reports the stored banner; the rest of the profile is
      // untouched, so the narrow shape keeps avatar-less accounts parseable.
      banner: z
        .object({
          bannerUrl: MobileHttpsUrlSchema,
          id: MobileResourceIdSchema,
        })
        .strict(),
      claimId: MobileResourceIdSchema,
      claimedAt: z.string().datetime(),
      purpose: z.literal("profile-banner"),
    })
    .strict(),
  z
    .object({
      claimId: MobileResourceIdSchema,
      claimedAt: z.string().datetime(),
      purpose: z.literal("server-icon"),
      server: z
        .object({
          iconUrl: MobileHttpsUrlSchema,
          id: MobileResourceIdSchema,
        })
        .strict(),
    })
    .strict(),
]);

export const MobileServerCapabilitiesSchema = z
  .object({
    canClearHistory: z.boolean(),
    canDeleteServer: z.boolean(),
    canKickMembers: z.boolean(),
    canManageChannels: z.boolean(),
    canManageInvites: z.boolean(),
    canManageMessages: z.boolean(),
    canManageRoles: z.boolean(),
    canManageServer: z.boolean(),
    canUploadServerIcon: z.boolean(),
  })
  .strict();

export const MobileServerSettingsUpdatedEventSchema = z
  .object({ serverId: MobileResourceIdSchema })
  .strict();
export const MobileServerMembershipAddedEventSchema = z
  .object({ serverId: MobileResourceIdSchema })
  .strict();
export const MobileServerMembershipRemovedEventSchema = z
  .object({
    reason: z.enum(["deleted", "kicked", "left"]),
    serverId: MobileResourceIdSchema,
  })
  .strict();
export const MobileMessageHistoryClearedEventSchema = z
  .object({ channelId: MobileResourceIdSchema })
  .strict();
export const MobilePresenceUpdateEventSchema = z
  .object({
    customStatus: z.string().max(128).nullable(),
    status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
    userId: MobileResourceIdSchema,
  })
  .strict();
export const MobileUserProfileUpdatedEventSchema = z
  .object({
    avatarUrl: MobileHttpsUrlSchema.nullable(),
    customStatus: z.string().max(128).nullable(),
    displayName: z.string().max(60).nullable(),
    status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
    userId: MobileResourceIdSchema,
    username: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/),
  })
  .strict();

export const MobileServerIdParamsSchema = z.object({ serverId: MobileResourceIdSchema }).strict();
export const MobileServerCategoryParamsSchema = z
  .object({
    categoryId: MobileResourceIdSchema,
    serverId: MobileResourceIdSchema,
  })
  .strict();
export const MobileServerChannelParamsSchema = z
  .object({
    channelId: MobileResourceIdSchema,
    serverId: MobileResourceIdSchema,
  })
  .strict();
export const MobileServerMemberParamsSchema = z
  .object({
    memberId: MobileResourceIdSchema,
    serverId: MobileResourceIdSchema,
  })
  .strict();
export const MobileServerEventParamsSchema = z
  .object({
    eventId: MobileResourceIdSchema,
    serverId: MobileResourceIdSchema,
  })
  .strict();
export const MobileChannelIdParamsSchema = z.object({ channelId: MobileResourceIdSchema }).strict();
export const MobileServerRoleParamsSchema = z
  .object({ roleId: MobileResourceIdSchema, serverId: MobileResourceIdSchema })
  .strict();

export const MobileManagedWorkspaceServerDetailResponseSchema = z
  .object({
    detail: MobileWorkspaceServerDetailResponseSchema.shape.detail
      .extend({ capabilities: MobileServerCapabilitiesSchema })
      .strict(),
  })
  .strict();

// Eski mobil sürümler yalnız adı gönderir. API sınırı bundan üç karakterlik kısa ad türetir;
// Web/Desktop sözleşmesindeki zorunlu kullanıcı alanını geriye dönük uyumluluk için taşımayız.
export const MobileServerCreateRequestSchema = CreateServerSchema.omit({
  iconUrl: true,
  shortName: true,
}).strict();
const MobileServerReferenceSchema = z.object({ id: MobileResourceIdSchema }).strict();
export const MobileServerCreateResponseSchema = z
  .object({ server: MobileServerReferenceSchema })
  .strict();
export const MobileServerJoinRequestSchema = z
  .object({
    inviteCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,96}$/),
  })
  .strict();
export const MobileServerJoinResponseSchema = z
  .object({ server: MobileServerReferenceSchema })
  .strict();

const MobileServerUpdateFieldsSchema = UpdateServerFieldsSchema.omit({ iconUrl: true }).strict();
/**
 * Read off the schema's own keys instead of a hand-written list. The manual
 * version stopped counting `isPublic`/`discoverable` the moment they landed on
 * `UpdateServerFieldsSchema`, which turned every visibility-only save into a
 * "validation.form.atLeastOne" 400 -- the same drift the web twin already hit
 * once. Extending the contract now extends the predicate with it.
 */
const MOBILE_SERVER_UPDATE_FIELDS = Object.keys(MobileServerUpdateFieldsSchema.shape) as Array<
  keyof z.infer<typeof MobileServerUpdateFieldsSchema>
>;
const hasMobileServerUpdate = (value: z.infer<typeof MobileServerUpdateFieldsSchema>) =>
  MOBILE_SERVER_UPDATE_FIELDS.some((field) => value[field] !== undefined);
export const MobileServerUpdateRequestSchema = MobileServerUpdateFieldsSchema.refine(
  hasMobileServerUpdate,
  { message: "validation.form.atLeastOne" },
);
export const MobileServerDeleteRequestSchema = DeleteServerSchema.extend({
  confirmationName: DeleteServerSchema.shape.confirmationName.max(64),
}).strict();

/**
 * 6d event management. The bodies are the shared `@wizards/types` contracts
 * verbatim -- the mobile form and the web admin surface write the same event,
 * so a mobile-only variant of the body would be two contracts for one table.
 */
export const MobileServerScheduledEventsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    includePast: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const MobileServerScheduledEventsResponseSchema = z
  .object({ events: z.array(ServerScheduledEventSchema) })
  .strict();
export const MobileServerScheduledEventResponseSchema = z
  .object({ event: ServerScheduledEventSchema })
  .strict();
/**
 * The request bodies themselves are not re-exported under a `Mobile` name: an
 * alias would only be a second name for the same object, and the coverage
 * assertion would then demand a duplicate fixture for it. Routes import
 * `CreateServerScheduledEventSchema` and friends straight from `@wizards/types`.
 */

/** 6c writes `starred`/`muted`/`notificationLevel` through this one body. */
export const MobileServerUserSettingsResponseSchema = z
  .object({ settings: ServerUserSettingsSchema })
  .strict();

export const MobileServerInviteCreateRequestSchema = CreateInviteSchema.extend({
  channelId: MobileResourceIdSchema.nullable().optional(),
}).strict();
export const MobileServerInviteSchema = z
  .object({
    channelId: MobileResourceIdSchema.nullable(),
    createdAt: z.string().datetime(),
    createdByDisplayName: z.string().min(1).max(120),
    expiresAt: z.string().datetime().nullable(),
    id: MobileResourceIdSchema,
    maxUses: z.number().int().positive().nullable(),
    shareUrl: MobileHttpsUrlSchema,
    /**
     * K10 — hedefli davet (Ş3) mobil sözleşmeye **opsiyonel** girer. Mobil davet listesi
     * zaten hedefli satırları da döndürüyordu ama onları etiketleyemiyordu; alan olmadan
     * cihaz tek kişilik bir daveti paylaşılabilir bağlantı sanardı. Opsiyonel, çünkü alanı
     * hiç göndermeyen eski bir yanıt da ayrıştırılabilir kalmalı.
     */
    targetUserId: MobileResourceIdSchema.nullable().optional(),
    uses: z.number().int().nonnegative(),
  })
  .strict();
export const MobileServerInviteCreateResponseSchema = z
  .object({ invite: MobileServerInviteSchema })
  .strict();
export const MobileServerInvitesResponseSchema = z
  .object({ invites: z.array(MobileServerInviteSchema).max(100) })
  .strict();
export const MobileServerInviteParamsSchema = z
  .object({ inviteId: MobileResourceIdSchema, serverId: MobileResourceIdSchema })
  .strict();

/**
 * Handoff 2a/2b — the "Davet et" sheet. It paints a link card, a friends list
 * and the pending targeted invites at once, so all three come from one read
 * instead of three staggered ones. The link/friend rows carry the server
 * context (`isMember`, `pendingInviteId`) that the standalone friends and
 * invites endpoints have no notion of.
 */
export const MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS = 24 * 7;
/** The four "Düzenle" durations, in hours; `null` is the "süresiz" option. */
export const MOBILE_INVITE_SHEET_EXPIRY_OPTIONS = [1, 24, 24 * 7, null] as const;
/** The four "Düzenle" usage caps; `null` is the "sınırsız" option. */
export const MOBILE_INVITE_SHEET_MAX_USES_OPTIONS = [1, 10, 50, null] as const;
/** A targeted invite is single-use by construction: one person, one seat. */
export const MOBILE_TARGETED_INVITE_MAX_USES = 1;

const MobileInviteSheetUserSchema = z
  .object({
    avatarUrl: z.string().url().max(2048).nullable(),
    displayName: z.string().max(60).nullable(),
    id: MobileResourceIdSchema,
    username: z.string().min(2).max(32),
  })
  .strict();

export const MobileServerInviteSheetFriendSchema = MobileInviteSheetUserSchema.extend({
  /** Already in the server, so the row renders the passive "Üye" pill. */
  isMember: z.boolean(),
  /** Feeds "n sa önce görüldü"; null when the account has never been seen. */
  lastSeenAt: z.string().datetime().nullable(),
  /**
   * Set when a targeted invite is still waiting, which is what makes the
   * "Gönderildi" state survive a sheet close/re-open instead of living in
   * local component state.
   */
  pendingInviteId: MobileResourceIdSchema.nullable(),
  status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
}).strict();

export const MobileServerPendingInviteSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: MobileResourceIdSchema,
    user: MobileInviteSheetUserSchema,
  })
  .strict();

export const MobileServerInviteSheetResponseSchema = z
  .object({
    friends: z.array(MobileServerInviteSheetFriendSchema).max(200),
    /**
     * The reusable, untargeted link the card shows. Null when the server has
     * no live one left; the sheet then creates the 7-day default on open.
     */
    linkInvite: MobileServerInviteSchema.nullable(),
    pendingInvites: z.array(MobileServerPendingInviteSchema).max(100),
  })
  .strict();

export const MobileServerTargetedInviteCreateRequestSchema = z
  .object({ userId: MobileResourceIdSchema })
  .strict();
export const MobileServerTargetedInviteCreateResponseSchema = z
  .object({ invite: MobileServerPendingInviteSchema })
  .strict();

/**
 * "Düzenle": an invite row is immutable, so the edit mints a replacement and
 * revokes the old link in one call. Admin-only, unlike plain invite creation.
 */
export const MobileServerInviteLinkUpdateRequestSchema = z
  .object({
    expiresInHours: z.number().int().min(1).max(720).nullable(),
    maxUses: z.number().int().min(1).max(1000).nullable(),
  })
  .strict();

/**
 * Recipient-side decline. Addressed by redemption code rather than invite id
 * because the recipient is not a member of that server yet, so they can reach
 * no server-scoped route — the code in their notification is all they hold.
 */
export const MobileServerInviteCodeParamsSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,96}$/),
  })
  .strict();

export const MobileServerInviteDeclineResponseSchema = z
  .object({ serverId: MobileResourceIdSchema, success: z.literal(true) })
  .strict();

export const MobileServerInviteQrResponseSchema = z
  .object({
    qrCodeDataUrl: z
      .string()
      .max(262_144)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  })
  .strict();

export const MobileCategoryCreateRequestSchema = CreateCategorySchema.strict();
const MobileCategoryReferenceSchema = z.object({ id: MobileResourceIdSchema }).strict();
export const MobileCategoryCreateResponseSchema = z
  .object({ category: MobileCategoryReferenceSchema })
  .strict();
export const MobileCategoryUpdateRequestSchema = UpdateCategorySchema.strict();

export const MobileChannelCreateRequestSchema = CreateChannelSchema.safeExtend({
  categoryId: MobileResourceIdSchema.nullable().optional(),
  permissions: z.never().optional(),
}).strict();
const MobileChannelReferenceSchema = z.object({ id: MobileResourceIdSchema }).strict();
export const MobileChannelCreateResponseSchema = z
  .object({ channel: MobileChannelReferenceSchema })
  .strict();
const MobileChannelUpdateFieldsSchema = UpdateChannelFieldsSchema.extend({
  categoryId: MobileResourceIdSchema.nullable().optional(),
}).strict();
const hasMobileChannelUpdate = (value: z.infer<typeof MobileChannelUpdateFieldsSchema>) =>
  value.name !== undefined ||
  value.categoryId !== undefined ||
  value.topic !== undefined ||
  value.locked !== undefined ||
  value.bitrate !== undefined ||
  value.rtcRegion !== undefined ||
  value.slowModeDelay !== undefined ||
  value.userLimit !== undefined ||
  value.videoQualityMode !== undefined;
export const MobileChannelUpdateRequestSchema = MobileChannelUpdateFieldsSchema.refine(
  hasMobileChannelUpdate,
  { message: "validation.form.atLeastOne" },
);

export const MobileServerMembersQuerySchema = z
  .object({
    cursor: MobileResourceIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  })
  .strict();
export const MobileServerMemberActionsSchema = z
  .object({
    canKick: z.boolean(),
    canManageRoles: z.boolean(),
  })
  .strict();
export const MobileServerMemberSchema = WorkspaceMemberSchema.extend({
  actions: MobileServerMemberActionsSchema,
  roleIds: z
    .array(MobileResourceIdSchema)
    .max(25)
    .refine((roleIds) => new Set(roleIds).size === roleIds.length, {
      message: "Role ids must be unique",
    }),
}).strict();
const MobileServerMemberPageSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    nextCursor: MobileResourceIdSchema.nullable(),
  })
  .strict();
export const MobileServerMembersResponseSchema = z
  .object({
    memberPage: MobileServerMemberPageSchema,
    members: z.array(MobileServerMemberSchema).max(100),
  })
  .strict();
export const MobileAssignableRoleSchema = z
  .object({
    color: z.number().int().min(0).max(0xffffff),
    id: MobileResourceIdSchema,
    name: z.string().trim().min(1).max(48),
    position: z.number().int(),
  })
  .strict();
export const MobileAssignableRolesResponseSchema = z
  .object({ roles: z.array(MobileAssignableRoleSchema).max(100) })
  .strict();
export const MobilePermissionKeySchema = z.enum([
  "ADMINISTRATOR",
  "MANAGE_SERVER",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_MESSAGES",
  "CLEAR_CHANNEL_HISTORY",
  "ATTACH_FILES",
  "USE_GIFS",
  "ADD_REACTIONS",
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM",
  "USE_VIDEO",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "MANAGE_INVITES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "TIMEOUT_MEMBERS",
  "VIEW_AUDIT_LOG",
  "MENTION_EVERYONE",
]);
export const MobileServerRoleOverviewSchema = z
  .object({
    color: z.number().int().min(0).max(0xffffff),
    id: MobileResourceIdSchema,
    isDefault: z.boolean(),
    managed: z.boolean(),
    memberCount: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(48),
    permissionKeys: z.array(MobilePermissionKeySchema).max(24),
    position: z.number().int(),
  })
  .strict();
export const MobileServerRoleOverviewResponseSchema = z
  .object({ roles: z.array(MobileServerRoleOverviewSchema).max(100) })
  .strict();

const MobileRoleColorSchema = z.number().int().min(0).max(0xffffff);
const MobileRolePermissionKeysSchema = z.array(MobilePermissionKeySchema).max(24);
export const MobileServerRoleSchema = z
  .object({
    color: MobileRoleColorSchema,
    id: MobileResourceIdSchema,
    isDefault: z.boolean(),
    managed: z.boolean(),
    mentionable: z.boolean(),
    name: z.string().trim().min(1).max(48),
    permissionKeys: MobileRolePermissionKeysSchema,
    position: z.number().int(),
  })
  .strict();
export const MobileRoleMutationResponseSchema = z.object({ role: MobileServerRoleSchema }).strict();
export const MobileRoleCreateRequestSchema = z
  .object({
    color: MobileRoleColorSchema.optional(),
    name: z.string().trim().min(1).max(48),
    permissionKeys: MobileRolePermissionKeysSchema.default([]),
  })
  .strict();
export const MobileRoleUpdateRequestSchema = z
  .object({
    color: MobileRoleColorSchema.optional(),
    name: z.string().trim().min(1).max(48).optional(),
    permissionKeys: MobileRolePermissionKeysSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.color !== undefined || value.permissionKeys !== undefined,
    { message: "validation.form.atLeastOne" },
  );
export const MobileMemberRolesUpdateRequestSchema = z
  .object({
    roleIds: z
      .array(MobileResourceIdSchema)
      .max(25)
      .refine((roleIds) => new Set(roleIds).size === roleIds.length, {
        message: "Role ids must be unique",
      }),
  })
  .strict();
export const MobileMutationSuccessResponseSchema = z.object({ success: z.literal(true) }).strict();
export const MobileChannelHistoryClearResponseSchema = z
  .object({ deletedCount: z.number().int().nonnegative() })
  .strict();

export type MobileMediaUploadPurpose = z.infer<typeof MobileMediaUploadPurposeSchema>;
export type MobileMediaUploadContentType = z.infer<typeof MobileMediaUploadContentTypeSchema>;
export type MobileMediaUploadIntent = z.infer<typeof MobileMediaUploadIntentSchema>;
export type MobileMediaUploadCompletionResponse = z.infer<
  typeof MobileMediaUploadCompletionResponseSchema
>;
export type MobileMediaClaimRequest = z.infer<typeof MobileMediaClaimRequestSchema>;
export type MobileMediaClaimResponse = z.infer<typeof MobileMediaClaimResponseSchema>;
export type MobileServerCapabilities = z.infer<typeof MobileServerCapabilitiesSchema>;
export type MobileServerSettingsUpdatedEvent = z.infer<
  typeof MobileServerSettingsUpdatedEventSchema
>;
export type MobileServerMembershipAddedEvent = z.infer<
  typeof MobileServerMembershipAddedEventSchema
>;
export type MobileServerMembershipRemovedEvent = z.infer<
  typeof MobileServerMembershipRemovedEventSchema
>;
export type MobileMessageHistoryClearedEvent = z.infer<
  typeof MobileMessageHistoryClearedEventSchema
>;
export type MobilePresenceUpdateEvent = z.infer<typeof MobilePresenceUpdateEventSchema>;
export type MobileUserProfileUpdatedEvent = z.infer<typeof MobileUserProfileUpdatedEventSchema>;
export type MobileServerIdParams = z.infer<typeof MobileServerIdParamsSchema>;
export type MobileServerCategoryParams = z.infer<typeof MobileServerCategoryParamsSchema>;
export type MobileServerEventParams = z.infer<typeof MobileServerEventParamsSchema>;
export type MobileServerScheduledEventsQuery = z.infer<
  typeof MobileServerScheduledEventsQuerySchema
>;
export type MobileServerScheduledEventsResponse = z.infer<
  typeof MobileServerScheduledEventsResponseSchema
>;
export type MobileServerScheduledEventResponse = z.infer<
  typeof MobileServerScheduledEventResponseSchema
>;
export type MobileServerUserSettingsResponse = z.infer<
  typeof MobileServerUserSettingsResponseSchema
>;
export type MobileServerChannelParams = z.infer<typeof MobileServerChannelParamsSchema>;
export type MobileServerMemberParams = z.infer<typeof MobileServerMemberParamsSchema>;
export type MobileChannelIdParams = z.infer<typeof MobileChannelIdParamsSchema>;
export type MobileServerRoleParams = z.infer<typeof MobileServerRoleParamsSchema>;
export type MobileManagedWorkspaceServerDetailResponse = z.infer<
  typeof MobileManagedWorkspaceServerDetailResponseSchema
>;
export type MobileServerCreateRequest = z.input<typeof MobileServerCreateRequestSchema>;
export type MobileServerCreateResponse = z.infer<typeof MobileServerCreateResponseSchema>;
export type MobileServerJoinRequest = z.infer<typeof MobileServerJoinRequestSchema>;
export type MobileServerJoinResponse = z.infer<typeof MobileServerJoinResponseSchema>;
export type MobileServerUpdateRequest = z.infer<typeof MobileServerUpdateRequestSchema>;
export type MobileServerDeleteRequest = z.infer<typeof MobileServerDeleteRequestSchema>;
export type MobileServerInviteCreateRequest = z.infer<typeof MobileServerInviteCreateRequestSchema>;
export type MobileServerInvite = z.infer<typeof MobileServerInviteSchema>;
export type MobileServerInviteCreateResponse = z.infer<
  typeof MobileServerInviteCreateResponseSchema
>;
export type MobileServerInvitesResponse = z.infer<typeof MobileServerInvitesResponseSchema>;
export type MobileServerInviteParams = z.infer<typeof MobileServerInviteParamsSchema>;
export type MobileServerInviteSheetFriend = z.infer<typeof MobileServerInviteSheetFriendSchema>;
export type MobileServerPendingInvite = z.infer<typeof MobileServerPendingInviteSchema>;
export type MobileServerInviteSheetResponse = z.infer<typeof MobileServerInviteSheetResponseSchema>;
export type MobileServerTargetedInviteCreateRequest = z.infer<
  typeof MobileServerTargetedInviteCreateRequestSchema
>;
export type MobileServerTargetedInviteCreateResponse = z.infer<
  typeof MobileServerTargetedInviteCreateResponseSchema
>;
export type MobileServerInviteLinkUpdateRequest = z.infer<
  typeof MobileServerInviteLinkUpdateRequestSchema
>;
export type MobileServerInviteQrResponse = z.infer<typeof MobileServerInviteQrResponseSchema>;
export type MobileServerInviteCodeParams = z.infer<typeof MobileServerInviteCodeParamsSchema>;
export type MobileServerInviteDeclineResponse = z.infer<
  typeof MobileServerInviteDeclineResponseSchema
>;
export type MobileCategoryCreateRequest = z.infer<typeof MobileCategoryCreateRequestSchema>;
export type MobileCategoryCreateResponse = z.infer<typeof MobileCategoryCreateResponseSchema>;
export type MobileCategoryUpdateRequest = z.infer<typeof MobileCategoryUpdateRequestSchema>;
export type MobileChannelCreateRequest = z.infer<typeof MobileChannelCreateRequestSchema>;
export type MobileChannelCreateResponse = z.infer<typeof MobileChannelCreateResponseSchema>;
export type MobileChannelUpdateRequest = z.infer<typeof MobileChannelUpdateRequestSchema>;
export type MobileServerMembersQuery = z.infer<typeof MobileServerMembersQuerySchema>;
export type MobileServerMemberActions = z.infer<typeof MobileServerMemberActionsSchema>;
export type MobileServerMember = z.infer<typeof MobileServerMemberSchema>;
export type MobileServerMembersResponse = z.infer<typeof MobileServerMembersResponseSchema>;
export type MobileAssignableRole = z.infer<typeof MobileAssignableRoleSchema>;
export type MobileAssignableRolesResponse = z.infer<typeof MobileAssignableRolesResponseSchema>;
export type MobileServerRoleOverview = z.infer<typeof MobileServerRoleOverviewSchema>;
export type MobilePermissionKey = z.infer<typeof MobilePermissionKeySchema>;
export type MobileServerRole = z.infer<typeof MobileServerRoleSchema>;
export type MobileRoleMutationResponse = z.infer<typeof MobileRoleMutationResponseSchema>;
export type MobileRoleCreateRequest = z.infer<typeof MobileRoleCreateRequestSchema>;
export type MobileRoleUpdateRequest = z.infer<typeof MobileRoleUpdateRequestSchema>;
export type MobileServerRoleOverviewResponse = z.infer<
  typeof MobileServerRoleOverviewResponseSchema
>;
export type MobileMemberRolesUpdateRequest = z.infer<typeof MobileMemberRolesUpdateRequestSchema>;
export type MobileMutationSuccessResponse = z.infer<typeof MobileMutationSuccessResponseSchema>;
export type MobileChannelHistoryClearResponse = z.infer<
  typeof MobileChannelHistoryClearResponseSchema
>;
