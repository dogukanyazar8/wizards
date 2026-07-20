import { z } from "zod";

import { MessageAttachmentSchema } from "./messages";
import { DMConversationDTOSchema } from "./socket";

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

export const MobileFriendSchema = MobileFriendUserSchema.extend({
  customStatus: z.string().max(128).nullable(),
  presence: MobileFriendPresenceSchema,
  status: MobileFriendPresenceStatusSchema,
}).strict();

export const MobileFriendRequestSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: MobileBoundedIdSchema,
    receiver: MobileFriendUserSchema,
    receiverId: MobileBoundedIdSchema,
    sender: MobileFriendUserSchema,
    senderId: MobileBoundedIdSchema,
    status: MobileFriendStatusSchema,
    updatedAt: z.string().datetime(),
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

export const MobilePresenceUpdateSchema = z
  .object({ status: MobileFriendPresenceStatusSchema })
  .strict();
export const MobilePresenceResponseSchema = z
  .object({ status: MobileFriendPresenceStatusSchema })
  .strict();

export const MobileProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(60).nullable().optional(),
    username: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
  })
  .strict()
  .refine((value) => value.displayName !== undefined || value.username !== undefined, {
    message: "At least one profile field is required",
  });

export const MobileProfileUserSchema = MobileFriendUserSchema.extend({
  customStatus: z.string().max(128).nullable(),
  status: MobileFriendPresenceStatusSchema,
  twoFactorEnabled: z.boolean(),
}).strict();
export const MobileProfileResponseSchema = z.object({ user: MobileProfileUserSchema }).strict();

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
    confirmPassword: z.string().min(1).max(100),
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(8).max(100),
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
export const MobileAccountSettingsResponseSchema = z
  .object({
    account: z
      .object({
        bio: z.string().max(1024).nullable(),
        customStatus: z.string().max(128).nullable(),
        email: z.string().email().max(254),
        emailVerified: z.boolean(),
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
  })
  .strict()
  .refine((value) => value.dmPermission !== undefined || value.friendRequests !== undefined, {
    message: "At least one privacy field is required",
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
export const MobileDMDetailsResponseSchema = z
  .object({
    mutualServers: z.array(MobileDMMutualServerSchema).max(12),
    nextCursor: MobileBoundedIdSchema.nullable(),
    participant: MobileProfileUserSchema.omit({ twoFactorEnabled: true }),
    sharedAttachments: z
      .object({
        files: z.array(MobileDMSharedAttachmentSchema).max(30),
        media: z.array(MobileDMSharedAttachmentSchema).max(30),
      })
      .strict(),
  })
  .strict();

export type MobileFriendRequestCreate = z.infer<typeof MobileFriendRequestCreateSchema>;
export type MobileFriendsOverviewResponse = z.infer<typeof MobileFriendsOverviewResponseSchema>;
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
export type MobilePasswordChangeRequest = z.infer<typeof MobilePasswordChangeRequestSchema>;
export type MobilePasswordChangeResponse = z.infer<typeof MobilePasswordChangeResponseSchema>;
export type MobileAccountSettingsResponse = z.infer<typeof MobileAccountSettingsResponseSchema>;
export type MobileAccountSettingsUpdate = z.infer<typeof MobileAccountSettingsUpdateSchema>;
