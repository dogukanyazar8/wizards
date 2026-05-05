import { z } from "zod";

function emptyStringToNull(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalTrimmedString = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .optional()
    .or(z.null())
    .transform((value) => emptyStringToNull(value));

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

export const WorkspaceAccessLevelSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const WorkspaceChannelTypeSchema = z.enum(["TEXT", "VOICE"]);

export const RoleBadgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().int().nonnegative(),
});

export const WorkspaceChannelSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  topic: z.string().nullable(),
  type: WorkspaceChannelTypeSchema,
  position: z.number().int().nonnegative(),
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
  name: z.string(),
  shortName: z.string().nullable(),
  defaultChannelId: z.string().nullable(),
  accessLevel: WorkspaceAccessLevelSchema,
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
  ungroupedChannels: z.array(WorkspaceChannelSchema),
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

export const CreateServerSchema = z.object({
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
});

export const UpdateServerSchema = z
  .object({
    allowFileUploads: z.boolean().optional(),
    allowGifs: z.boolean().optional(),
    allowMemberAdds: z.boolean().optional(),
    description: optionalTrimmedString(160),
    iconUrl: z
      .string()
      .url()
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => emptyStringToNull(value)),
    name: z.string().trim().min(2).max(64).optional(),
    shortName: optionalServerShortName,
  })
  .refine((value) =>
    value.name !== undefined ||
    value.shortName !== undefined ||
    value.description !== undefined ||
    value.iconUrl !== undefined ||
    value.allowGifs !== undefined ||
    value.allowFileUploads !== undefined ||
    value.allowMemberAdds !== undefined, {
    message: "validation.form.atLeastOne",
  });

export const AddServerMemberSchema = z.object({
  username: z.string().trim().min(2).max(32),
});

export const DeleteServerSchema = z.object({
  confirmationName: z.string().trim().min(1),
});

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(32),
});

export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(1).max(32),
});

export const CreateChannelSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "validation.channel.pattern"),
  topic: optionalTrimmedString(120),
  type: WorkspaceChannelTypeSchema,
});

export const UpdateChannelSchema = z
  .object({
    categoryId: z.string().nullable().optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9-]+$/, "validation.channel.pattern")
      .optional(),
    topic: optionalTrimmedString(120),
  })
  .refine((value) => value.name !== undefined || value.categoryId !== undefined || value.topic !== undefined, {
    message: "validation.form.atLeastOne",
  });

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

export const CreateInviteSchema = z.object({
  channelId: z.string().nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

export type WorkspaceAccessLevel = z.infer<typeof WorkspaceAccessLevelSchema>;
export type WorkspaceCategory = z.infer<typeof WorkspaceCategorySchema>;
export type WorkspaceChannel = z.infer<typeof WorkspaceChannelSchema>;
export type WorkspaceChannelType = z.infer<typeof WorkspaceChannelTypeSchema>;
export type WorkspaceInvite = z.infer<typeof WorkspaceInviteSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export type WorkspaceMemberPage = z.infer<typeof WorkspaceMemberPageSchema>;
export type WorkspaceMembersResponse = z.infer<typeof WorkspaceMembersResponseSchema>;
export type WorkspaceServerDetail = z.infer<typeof WorkspaceServerDetailSchema>;
export type WorkspaceServerSummary = z.infer<typeof WorkspaceServerSummarySchema>;
export type CreateServerInput = z.infer<typeof CreateServerSchema>;
export type UpdateServerInput = z.infer<typeof UpdateServerSchema>;
export type DeleteServerInput = z.infer<typeof DeleteServerSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
export type ReorderChannelsInput = z.infer<typeof ReorderChannelsSchema>;
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;
export type AddServerMemberInput = z.infer<typeof AddServerMemberSchema>;
