import { z } from "zod";

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
export type MobileAuthExchangeRequest = z.infer<typeof MobileAuthExchangeRequestSchema>;
export type MobileAuthExchangeResponse = z.infer<typeof MobileAuthExchangeResponseSchema>;
export type MobileAuthRefreshRequest = z.infer<typeof MobileAuthRefreshRequestSchema>;
export type MobileAuthRefreshResponse = z.infer<typeof MobileAuthRefreshResponseSchema>;
export type MobileAuthRevokeRequest = z.infer<typeof MobileAuthRevokeRequestSchema>;
export type MobileSessionSnapshotPayload = z.infer<typeof MobileSessionSnapshotSchema>;
