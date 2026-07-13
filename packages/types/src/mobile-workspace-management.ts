import { z } from "zod";

import { MobileWorkspaceServerDetailResponseSchema } from "./mobile";
import {
  CreateCategorySchema,
  CreateChannelSchema,
  CreateInviteSchema,
  CreateServerSchema,
  DeleteServerSchema,
  UpdateCategorySchema,
  UpdateChannelFieldsSchema,
  UpdateServerFieldsSchema,
  WorkspaceMemberSchema,
} from "./workspace";

const MobileResourceIdSchema = z.string().trim().min(1).max(128);

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const MobileHttpsUrlSchema = z.string().url().max(2048).refine(isHttpsUrl, "HTTPS URL required");

export const MobileMediaUploadPurposeSchema = z.enum(["profile-avatar", "server-icon"]);
export const MobileMediaUploadContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const MobileMediaUploadIntentSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("profile-avatar") }).strict(),
  z
    .object({
      purpose: z.literal("server-icon"),
      targetServerId: MobileResourceIdSchema,
    })
    .strict(),
]);
export const MobileMediaUploadCompletionResponseSchema = z
  .object({
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
export const MobileChannelIdParamsSchema = z.object({ channelId: MobileResourceIdSchema }).strict();

export const MobileManagedWorkspaceServerDetailResponseSchema = z
  .object({
    detail: MobileWorkspaceServerDetailResponseSchema.shape.detail
      .extend({ capabilities: MobileServerCapabilitiesSchema })
      .strict(),
  })
  .strict();

export const MobileServerCreateRequestSchema = CreateServerSchema.omit({ iconUrl: true }).strict();
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
const hasMobileServerUpdate = (value: z.infer<typeof MobileServerUpdateFieldsSchema>) =>
  value.name !== undefined ||
  value.shortName !== undefined ||
  value.description !== undefined ||
  value.messageCharacterLimit !== undefined ||
  value.deletedMessageNoticeMinutes !== undefined ||
  value.allowGifs !== undefined ||
  value.allowFileUploads !== undefined ||
  value.allowMemberAdds !== undefined;
export const MobileServerUpdateRequestSchema = MobileServerUpdateFieldsSchema.refine(
  hasMobileServerUpdate,
  { message: "validation.form.atLeastOne" },
);
export const MobileServerDeleteRequestSchema = DeleteServerSchema.extend({
  confirmationName: DeleteServerSchema.shape.confirmationName.max(64),
}).strict();

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
    uses: z.number().int().nonnegative(),
  })
  .strict();
export const MobileServerInviteCreateResponseSchema = z
  .object({ invite: MobileServerInviteSchema })
  .strict();
export const MobileServerInvitesResponseSchema = z
  .object({ invites: z.array(MobileServerInviteSchema).max(100) })
  .strict();

export const MobileCategoryCreateRequestSchema = CreateCategorySchema.strict();
const MobileCategoryReferenceSchema = z.object({ id: MobileResourceIdSchema }).strict();
export const MobileCategoryCreateResponseSchema = z
  .object({ category: MobileCategoryReferenceSchema })
  .strict();
export const MobileCategoryUpdateRequestSchema = UpdateCategorySchema.strict();

export const MobileChannelCreateRequestSchema = CreateChannelSchema.omit({ permissions: true })
  .extend({ categoryId: MobileResourceIdSchema.nullable().optional() })
  .strict();
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
  value.locked !== undefined;
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
export type MobileServerChannelParams = z.infer<typeof MobileServerChannelParamsSchema>;
export type MobileServerMemberParams = z.infer<typeof MobileServerMemberParamsSchema>;
export type MobileChannelIdParams = z.infer<typeof MobileChannelIdParamsSchema>;
export type MobileManagedWorkspaceServerDetailResponse = z.infer<
  typeof MobileManagedWorkspaceServerDetailResponseSchema
>;
export type MobileServerCreateRequest = z.infer<typeof MobileServerCreateRequestSchema>;
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
export type MobileMemberRolesUpdateRequest = z.infer<typeof MobileMemberRolesUpdateRequestSchema>;
export type MobileMutationSuccessResponse = z.infer<typeof MobileMutationSuccessResponseSchema>;
export type MobileChannelHistoryClearResponse = z.infer<
  typeof MobileChannelHistoryClearResponseSchema
>;
