import { z } from "zod";
import {
  ChatMessageSchema,
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MessagesResponseSchema,
  UploadedAttachmentInputSchema,
} from "./messages";
import { DMConversationDTOSchema, DMMessagePayloadSchema } from "./socket";
import { WorkspaceChannelSchema } from "./workspace";

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

export const MobileBootstrapDeepLinkIntentSchema = z.enum([
  "auth-handoff",
  "invite",
  "route",
]);

export const MobileBootstrapPermissionIntentSchema = z.enum([
  "camera",
  "microphone",
  "notifications",
  "photoLibrary",
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
});

export const MobileAuthPasswordLoginResponseSchema = z.object({
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

export const MobileBootstrapServerSummarySchema = z.object({
  channelCount: z.number().int().nonnegative(),
  iconUrl: z.string().url().nullable(),
  id: z.string().min(1),
  joinedAt: z.string().datetime(),
  memberCount: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(8).nullable(),
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
      recent: z.array(MobileBootstrapServerSummarySchema).max(5),
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

export const MobileDMMessagesResponseSchema = z.object({
  conversation: DMConversationDTOSchema,
  messages: z.array(DMMessagePayloadSchema).max(30),
  nextCursor: z.string().nullable(),
});

export const MobileDMSendMessageRequestSchema = z
  .object({
    attachments: z.array(UploadedAttachmentInputSchema).max(5).default([]),
    content: z.string().max(MESSAGE_CONTENT_DEFAULT_LIMIT),
    replyToId: z.string().min(1).max(128).nullable().optional(),
    threadParentId: z.string().min(1).max(128).nullable().optional(),
  })
  .refine((value) => value.content.trim().length > 0 || value.attachments.length > 0, {
    message: "Message content or attachment is required",
    path: ["content"],
  });

export const MobileDMSendMessageResponseSchema = z.object({
  message: DMMessagePayloadSchema,
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
});

export const MobileWorkspaceCategorySummarySchema = z.object({
  channels: z.array(MobileWorkspaceChannelSummarySchema).max(40),
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
});

export const MobileWorkspaceServerDetailSchema = z.object({
  categories: z.array(MobileWorkspaceCategorySummarySchema).max(20),
  hasMoreChannels: z.boolean(),
  server: z.object({
    defaultChannelId: z.string().min(1).nullable(),
    description: z.string().max(240).nullable(),
    iconUrl: z.string().url().nullable(),
    id: z.string().min(1),
    memberCount: z.number().int().nonnegative(),
    mentionCount: z.number().int().nonnegative(),
    name: z.string().min(1).max(120),
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

export type MobileBootstrapFeatureStatus = z.infer<
  typeof MobileBootstrapFeatureStatusSchema
>;
export type MobileBootstrapFeature = z.infer<typeof MobileBootstrapFeatureSchema>;
export type MobileBootstrapServerSummary = z.infer<
  typeof MobileBootstrapServerSummarySchema
>;
export type MobileBootstrapDMParticipant = z.infer<
  typeof MobileBootstrapDMParticipantSchema
>;
export type MobileBootstrapDMConversationSummary = z.infer<
  typeof MobileBootstrapDMConversationSummarySchema
>;
export type MobileBootstrapPayload = z.infer<typeof MobileBootstrapPayloadSchema>;
export type MobileDMMessagesResponse = z.infer<typeof MobileDMMessagesResponseSchema>;
export type MobileDMSendMessageRequest = z.infer<
  typeof MobileDMSendMessageRequestSchema
>;
export type MobileDMSendMessageResponse = z.infer<
  typeof MobileDMSendMessageResponseSchema
>;
export type MobileWorkspaceChannelSummary = z.infer<
  typeof MobileWorkspaceChannelSummarySchema
>;
export type MobileWorkspaceServerDetail = z.infer<
  typeof MobileWorkspaceServerDetailSchema
>;
export type MobileWorkspaceServerDetailResponse = z.infer<
  typeof MobileWorkspaceServerDetailResponseSchema
>;
export type MobileChannelMessagesResponse = z.infer<
  typeof MobileChannelMessagesResponseSchema
>;
export type MobileAuthExchangeRequest = z.infer<typeof MobileAuthExchangeRequestSchema>;
export type MobileAuthExchangeResponse = z.infer<typeof MobileAuthExchangeResponseSchema>;
export type MobileAuthRefreshRequest = z.infer<typeof MobileAuthRefreshRequestSchema>;
export type MobileAuthRefreshResponse = z.infer<typeof MobileAuthRefreshResponseSchema>;
export type MobileAuthRevokeRequest = z.infer<typeof MobileAuthRevokeRequestSchema>;
export type MobileAuthPasswordLoginRequest = z.infer<
  typeof MobileAuthPasswordLoginRequestSchema
>;
export type MobileAuthPasswordLoginResponse = z.infer<
  typeof MobileAuthPasswordLoginResponseSchema
>;
export type MobileAuthRegisterRequest = z.infer<typeof MobileAuthRegisterRequestSchema>;
export type MobileAuthRegisterResponse = z.infer<typeof MobileAuthRegisterResponseSchema>;
export type MobileAuthForgotPasswordRequest = z.infer<
  typeof MobileAuthForgotPasswordRequestSchema
>;
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
