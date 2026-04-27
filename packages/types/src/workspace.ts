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
  displayName: z.string(),
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

export const WorkspaceServerSummarySchema = z.object({
  id: z.string(),
  iconUrl: z.string().nullable(),
  inviteCode: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  name: z.string(),
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
  members: z.array(WorkspaceMemberSchema),
  ungroupedChannels: z.array(WorkspaceChannelSchema),
});

export const WorkspaceServersResponseSchema = z.object({
  servers: z.array(WorkspaceServerSummarySchema),
});

export const WorkspaceServerResponseSchema = z.object({
  detail: WorkspaceServerDetailSchema,
});

export const CreateServerSchema = z.object({
  description: optionalTrimmedString(160),
  iconUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .or(z.null())
    .transform((value) => emptyStringToNull(value)),
  name: z.string().trim().min(2).max(64),
});

export const UpdateServerSchema = z
  .object({
    description: optionalTrimmedString(160),
    iconUrl: z
      .string()
      .url()
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((value) => emptyStringToNull(value)),
    name: z.string().trim().min(2).max(64).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined || value.iconUrl !== undefined, {
    message: "validation.form.atLeastOne",
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
  expiresInHours: z.number().int().min(1).max(720).optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

export type WorkspaceAccessLevel = z.infer<typeof WorkspaceAccessLevelSchema>;
export type WorkspaceCategory = z.infer<typeof WorkspaceCategorySchema>;
export type WorkspaceChannel = z.infer<typeof WorkspaceChannelSchema>;
export type WorkspaceChannelType = z.infer<typeof WorkspaceChannelTypeSchema>;
export type WorkspaceInvite = z.infer<typeof WorkspaceInviteSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
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
