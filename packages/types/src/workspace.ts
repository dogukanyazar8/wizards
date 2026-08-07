import { z } from "zod";

function emptyStringToNull(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalTrimmedString = (maxLength: number, preserveUndefined = false) =>
  z
    .string()
    .max(maxLength)
    .optional()
    .or(z.null())
    .transform((value) =>
      preserveUndefined && value === undefined ? undefined : emptyStringToNull(value),
    );

const optionalServerShortName = z
  .string()
  .trim()
  .max(4)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,3}$/u, "validation.server.shortNamePattern")
  .optional()
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    const normalized = emptyStringToNull(value);
    return normalized ? normalized.toUpperCase() : null;
  });

const workspaceNameSchema = (maxLength: number, patternMessage: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .regex(/[\p{L}\p{N}]/u, patternMessage)
    .regex(/^[\p{L}\p{N}\p{M} _-]+$/u, patternMessage);

export const WorkspaceAccessLevelSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const WorkspaceChannelTypeSchema = z.enum(["TEXT", "VOICE"]);

export const WorkspacePermissionKeySchema = z.enum([
  "ADMINISTRATOR",
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_MESSAGES",
  "CLEAR_CHANNEL_HISTORY",
  "ATTACH_FILES",
  "USE_GIFS",
  "ADD_REACTIONS",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM",
  "USE_VIDEO",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
  "MANAGE_INVITES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "TIMEOUT_MEMBERS",
  "VIEW_AUDIT_LOG",
  "MENTION_EVERYONE",
]);

export const WorkspaceChannelPermissionPresetSchema = z.enum([
  "PUBLIC",
  "LOCKED_VISIBLE",
  "PRIVATE",
  "ROLE_GATED",
]);

export const WorkspaceChannelPermissionSettingsSchema = z.object({
  allowedRoleIds: z.array(z.string()),
  preset: WorkspaceChannelPermissionPresetSchema,
});

export const RoleBadgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().int().nonnegative(),
});

export const WorkspaceRoleSchema = z.object({
  color: z.number().int().nonnegative(),
  id: z.string(),
  isDefault: z.boolean(),
  managed: z.boolean(),
  mentionable: z.boolean(),
  name: z.string(),
  permissions: z.array(WorkspacePermissionKeySchema),
  position: z.number().int(),
});

export const WorkspaceChannelSchema = z.object({
  canAccess: z.boolean().default(true),
  id: z.string(),
  categoryId: z.string().nullable(),
  permissionPreset: WorkspaceChannelPermissionPresetSchema.optional(),
  locked: z.boolean().default(false),
  mentionCount: z.number().int().nonnegative().default(0),
  name: z.string(),
  topic: z.string().nullable(),
  type: WorkspaceChannelTypeSchema,
  position: z.number().int().nonnegative(),
  readOnly: z.boolean().default(false),
  unreadCount: z.number().int().nonnegative().default(0),
});

export const WorkspaceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  channels: z.array(WorkspaceChannelSchema),
});

export const WorkspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accessLevel: WorkspaceAccessLevelSchema,
  avatarUrl: z.string().nullable(),
  customStatus: z.string().nullable(),
  displayName: z.string(),
  status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]),
  username: z.string(),
  roles: z.array(RoleBadgeSchema),
});

export const WorkspaceInviteSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  code: z.string(),
  createdAt: z.string().datetime(),
  createdByDisplayName: z.string(),
  expiresAt: z.string().datetime().nullable(),
  maxUses: z.number().int().positive().nullable(),
  uses: z.number().int().nonnegative(),
});

export const WorkspaceMemberPageSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
});

export const WorkspaceServerSummarySchema = z.object({
  allowFileUploads: z.boolean(),
  allowGifs: z.boolean(),
  allowMemberAdds: z.boolean(),
  id: z.string(),
  iconUrl: z.string().nullable(),
  inviteCode: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  messageCharacterLimit: z.number().int().positive(),
  deletedMessageNoticeMinutes: z.number().int().min(5).max(10080),
  name: z.string(),
  shortName: z.string().nullable(),
  defaultChannelId: z.string().nullable(),
  accessLevel: WorkspaceAccessLevelSchema,
  mentionCount: z.number().int().nonnegative().default(0),
  unreadCount: z.number().int().nonnegative(),
});

export const WorkspaceServerDetailSchema = z.object({
  server: WorkspaceServerSummarySchema.extend({
    description: z.string().nullable(),
    isAdmin: z.boolean(),
    isOwner: z.boolean(),
  }),
  categories: z.array(WorkspaceCategorySchema),
  invites: z.array(WorkspaceInviteSchema),
  memberPage: WorkspaceMemberPageSchema,
  members: z.array(WorkspaceMemberSchema),
  roles: z.array(WorkspaceRoleSchema),
  ungroupedChannels: z.array(WorkspaceChannelSchema, { error: "Expected array" }),
});

export const WorkspaceServersResponseSchema = z.object({
  servers: z.array(WorkspaceServerSummarySchema),
});

export const WorkspaceServerResponseSchema = z.object({
  detail: WorkspaceServerDetailSchema,
});

export const WorkspaceMembersResponseSchema = z.object({
  memberPage: WorkspaceMemberPageSchema,
  members: z.array(WorkspaceMemberSchema),
});

export const ServerTypeSchema = z.enum(["PERSONAL", "COMMUNITY"]);

export const ServerVerificationLevelSchema = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);

export const CreateServerSchema = z
  .object({
    allowFileUploads: z.boolean().optional().default(true),
    allowGifs: z.boolean().optional().default(true),
    allowMemberAdds: z.boolean().optional().default(true),
    description: optionalTrimmedString(160),
    iconUrl: z
      .string()
      .url()
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => emptyStringToNull(value)),
    name: z.string().trim().min(2).max(64),
    shortName: optionalServerShortName,
  })
  .strict();

/**
 * Community servers exist only behind the admin surface, so the privileged
 * fields live on a separate schema. The consumer contract never carries them —
 * the gate is the shape of the request, not a runtime check inside the service.
 */
export const AdminCreateServerSchema = CreateServerSchema.extend({
  discoverable: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(false),
  type: ServerTypeSchema.default("PERSONAL"),
  verificationLevel: ServerVerificationLevelSchema.optional().default("NONE"),
}).refine((value) => value.type !== "COMMUNITY" || value.isPublic, {
  message: "Community servers must be publicly joinable",
  path: ["isPublic"],
});

export const UpdateServerFieldsSchema = z.object({
  allowFileUploads: z.boolean().optional(),
  allowGifs: z.boolean().optional(),
  allowMemberAdds: z.boolean().optional(),
  description: optionalTrimmedString(160, true),
  discoverable: z.boolean().optional(),
  iconUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .or(z.null())
    .transform((value) => (value === undefined ? undefined : emptyStringToNull(value))),
  isPublic: z.boolean().optional(),
  name: z.string().trim().min(2).max(64).optional(),
  messageCharacterLimit: z.number().int().min(250).max(40000).optional(),
  deletedMessageNoticeMinutes: z.number().int().min(5).max(10080).optional(),
  shortName: optionalServerShortName,
});

export const UpdateServerSchema = UpdateServerFieldsSchema.refine(
  (value) =>
    value.name !== undefined ||
    value.shortName !== undefined ||
    value.description !== undefined ||
    value.iconUrl !== undefined ||
    value.messageCharacterLimit !== undefined ||
    value.deletedMessageNoticeMinutes !== undefined ||
    value.allowGifs !== undefined ||
    value.allowFileUploads !== undefined ||
    value.allowMemberAdds !== undefined ||
    value.isPublic !== undefined ||
    value.discoverable !== undefined,
  {
    message: "validation.form.atLeastOne",
  },
);

export const AddServerMemberSchema = z.object({
  username: z.string().trim().min(2).max(32),
});

export const DeleteServerSchema = z.object({
  confirmationName: z.string().trim().min(1),
});

export const CreateCategorySchema = z.object({
  name: workspaceNameSchema(48, "validation.category.pattern"),
});

export const UpdateCategorySchema = z.object({
  name: workspaceNameSchema(48, "validation.category.pattern"),
});

export const CreateChannelSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name: workspaceNameSchema(48, "validation.channel.pattern"),
  permissions: WorkspaceChannelPermissionSettingsSchema.optional(),
  topic: optionalTrimmedString(120),
  type: WorkspaceChannelTypeSchema,
});

export const UpdateChannelFieldsSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name: workspaceNameSchema(48, "validation.channel.pattern").optional(),
  topic: optionalTrimmedString(120, true),
  locked: z.boolean().optional(),
});

export const UpdateChannelSchema = UpdateChannelFieldsSchema.refine(
  (value) =>
    value.name !== undefined ||
    value.categoryId !== undefined ||
    value.topic !== undefined ||
    value.locked !== undefined,
  {
    message: "validation.form.atLeastOne",
  },
);

export const ReorderChannelsSchema = z.object({
  items: z
    .array(
      z.object({
        categoryId: z.string().nullable(),
        id: z.string(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const ReorderCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const CreateInviteSchema = z.object({
  channelId: z.string().nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

export const WorkspaceRoleMutationSchema = z.object({
  color: z.number().int().min(0).max(0xffffff).optional(),
  mentionable: z.boolean().optional(),
  name: workspaceNameSchema(48, "validation.role.pattern").optional(),
  permissions: z.array(WorkspacePermissionKeySchema).optional(),
});

export const CreateWorkspaceRoleSchema = WorkspaceRoleMutationSchema.extend({
  name: workspaceNameSchema(48, "validation.role.pattern"),
  permissions: z.array(WorkspacePermissionKeySchema).default([]),
});

export const UpdateWorkspaceRoleSchema = WorkspaceRoleMutationSchema.refine(
  (value) =>
    value.name !== undefined ||
    value.color !== undefined ||
    value.mentionable !== undefined ||
    value.permissions !== undefined,
  {
    message: "validation.form.atLeastOne",
  },
);

export const UpdateWorkspaceMemberRolesSchema = z.object({
  roleIds: z.array(z.string()).max(25),
});

export const UpdateWorkspaceChannelPermissionsSchema = WorkspaceChannelPermissionSettingsSchema;

export const ServerPublicProfileChannelSchema = z.object({
  liveCount: z.number().int().nonnegative().nullable(),
  name: z.string(),
  readOnly: z.boolean(),
  type: z.enum(["text", "voice"]),
});

export const ServerPublicProfileFriendSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
});

/**
 * One read model behind three surfaces: the 2g profile card, the discovery
 * card, and the invite preview. Keeping it single stops the permission filter
 * from being written twice and drifting.
 */
export const ServerPublicProfileSchema = z.object({
  bannerUrl: z.string().nullable(),
  channels: z.array(ServerPublicProfileChannelSchema),
  description: z.string(),
  discoverable: z.boolean(),
  iconUrl: z.string().nullable(),
  isPublic: z.boolean(),
  joined: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  mutualFriendCount: z.number().int().nonnegative(),
  mutualFriends: z.array(ServerPublicProfileFriendSchema),
  name: z.string(),
  onlineCount: z.number().int().nonnegative(),
  serverId: z.string(),
  shortName: z.string().nullable(),
  type: ServerTypeSchema,
  verified: z.boolean(),
});

export type WorkspaceAccessLevel = z.infer<typeof WorkspaceAccessLevelSchema>;
export type WorkspaceCategory = z.infer<typeof WorkspaceCategorySchema>;
export type WorkspaceChannel = z.infer<typeof WorkspaceChannelSchema>;
export type WorkspaceChannelPermissionPreset = z.infer<
  typeof WorkspaceChannelPermissionPresetSchema
>;
export type WorkspaceChannelPermissionSettings = z.infer<
  typeof WorkspaceChannelPermissionSettingsSchema
>;
export type WorkspaceChannelType = z.infer<typeof WorkspaceChannelTypeSchema>;
export type WorkspaceInvite = z.infer<typeof WorkspaceInviteSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export type WorkspaceMemberPage = z.infer<typeof WorkspaceMemberPageSchema>;
export type WorkspaceMembersResponse = z.infer<typeof WorkspaceMembersResponseSchema>;
export type WorkspacePermissionKey = z.infer<typeof WorkspacePermissionKeySchema>;
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceServerDetail = z.infer<typeof WorkspaceServerDetailSchema>;
export type WorkspaceServerSummary = z.infer<typeof WorkspaceServerSummarySchema>;
export type CreateServerInput = z.input<typeof CreateServerSchema>;
export type UpdateServerInput = z.input<typeof UpdateServerSchema>;
export type DeleteServerInput = z.infer<typeof DeleteServerSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
export type ReorderChannelsInput = z.infer<typeof ReorderChannelsSchema>;
export type ReorderCategoriesInput = z.infer<typeof ReorderCategoriesSchema>;
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;
export type AddServerMemberInput = z.infer<typeof AddServerMemberSchema>;
export type CreateWorkspaceRoleInput = z.infer<typeof CreateWorkspaceRoleSchema>;
export type UpdateWorkspaceRoleInput = z.infer<typeof UpdateWorkspaceRoleSchema>;
export type UpdateWorkspaceMemberRolesInput = z.infer<typeof UpdateWorkspaceMemberRolesSchema>;
export type UpdateWorkspaceChannelPermissionsInput = z.infer<
  typeof UpdateWorkspaceChannelPermissionsSchema
>;
export type ServerTypeValue = z.infer<typeof ServerTypeSchema>;
export type AdminCreateServerInput = z.infer<typeof AdminCreateServerSchema>;
export type ServerPublicProfile = z.infer<typeof ServerPublicProfileSchema>;
export type ServerPublicProfileChannel = z.infer<typeof ServerPublicProfileChannelSchema>;
export type ServerPublicProfileFriend = z.infer<typeof ServerPublicProfileFriendSchema>;
