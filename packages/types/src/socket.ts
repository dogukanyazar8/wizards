import { z } from "zod";
import {
  AttachmentScanStatusSchema,
  MessageReactionSchema,
  MessageThreadSummarySchema,
  type AttachmentScanStatus,
  type MessageReaction,
  type MessageThreadSummary,
} from "./messages";
import { DMSystemMessageTypeSchema, type DMSystemMessageTypeValue } from "./dm-system-message";
import { PollDTOSchema, type PollDTO } from "./poll";
import {
  DMNotifyLevelSchema,
  DMParticipantRoleSchema,
  GroupDisappearingWindowSchema,
  GroupHistoryVisibilitySchema,
  GroupPermissionsSchema,
  type DMNotifyLevel,
  type DMParticipantRole,
  type GroupAvatarTile,
  type GroupDisappearingWindow,
  type GroupHistoryVisibility,
  type GroupPermissions,
} from "./group-dm-settings";

export type DMPresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
export type DMConversationType = "DM" | "GROUP_DM";

export interface DMPresence {
  status: DMPresenceStatus;
  customStatus: string | null;
}

export interface DMMessageAuthorPayload {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: DMPresenceStatus;
  customStatus: string | null;
}

export interface DMMessageAttachmentPayload {
  id: string;
  url: string | null;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
  scanStatus?: AttachmentScanStatus | undefined;
}

export interface DMMessagePayload {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  threadParentId: string | null;
  threadSummary?: MessageThreadSummary | undefined;
  forwardedAt?: string | null | undefined;
  editedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  createdAt: string;
  author: DMMessageAuthorPayload;
  attachments: DMMessageAttachmentPayload[];
  reactions: MessageReaction[];
  replyTo: DMMessagePayload | null;
  /**
   * Mesajlar karar #1. Present only on the rare message that carries a poll, so
   * the hot payload does not grow for the other 99%. Carried inline rather than
   * fetched by id: a card that appears and then fills in a beat later reads as a
   * loading bug on a message that has already arrived.
   */
  poll?: PollDTO | null | undefined;
  /** Client-side optimistic state — the server never sends this field. */
  deliveryStatus?: "sending" | "failed" | undefined;
  /**
   * The id the sender's own optimistic bubble was created under, echoed back so
   * the sender can recognise its own message. Present only on the copy that goes
   * to the author — the HTTP response and the author's socket fan-out — because
   * nobody else has a bubble to match it against.
   */
  clientNonce?: string | null | undefined;
  /**
   * Faz 5 §16. A group event rides the message stream as a row whose `content`
   * is always `""` — the server never writes user-facing prose, because the
   * sentence is locale-dependent and the locale belongs to the reader. Null on
   * every ordinary message.
   */
  systemType: DMSystemMessageTypeValue | null;
  /** Populated only for `MEMBER_ADDED` and `MEMBER_REMOVED`. */
  systemTargetUserIds: string[];
  /** Populated only for `NAME_CHANGED`. */
  systemValue: string | null;
  /**
   * 2d §8. Present on exactly one message per page: the newest outgoing message
   * of a group. Computing it for every bubble would be a query per message, and
   * the design only ever draws it under the last one.
   */
  readReceipt?: DMReadReceipt | undefined;
  /**
   * Mesajlar §6.1. Yazarının ana sohbete de gönderdiği bir thread yanıtı.
   * İsteğe bağlı: alanı tanımayan eski bir istemci yükü ayrıştırmayı sürdürsün.
   */
  alsoSentToChannel?: boolean | undefined;
  /**
   * K3. When this message is swept, or null when it is permanent. Optional
   * because the field shipped after the UAT backend and an older payload must
   * keep parsing; a client that does not know it simply never counts down.
   */
  expiresAt?: string | null | undefined;
}

/** 2d §8 — the avatar stack and the "4 kişi okudu" / "Herkes okudu" line. */
export interface DMReadReceipt {
  readerIds: string[];
  count: number;
  everyone: boolean;
}

export interface DMParticipantDTO extends DMPresence {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  /**
   * 2a §5 / F2. Unseen `@you`s, counted apart from `unreadCount` because a row
   * can be marked read and still be holding a mention. Optional: the mobile
   * payload has carried it since Faz 3, this DTO gained it in Faz 4, and a
   * fixture written before either must still parse.
   */
  mentionCount?: number | undefined;
  muted: boolean;
  /**
   * Newest `AppSession.lastSeenAt` for this participant — the same source the
   * friends list and the invite sheet already read. Optional because it shipped
   * after the UAT backend, so a payload from an older server still parses
   * instead of taking the whole conversation down.
   */
  lastSeenAt?: string | null | undefined;
  presence: DMPresence;
  /**
   * Faz 1 §B3. Group membership facts, carried on the participant row the DTO
   * already ships rather than in a second `members` array — that array would
   * repeat `presence` and `lastSeenAt` inside the same body.
   *
   * All three are optional: 1:1 conversations have no roles worth reading, and
   * the hand-built fixtures that predate them must still parse.
   */
  role?: DMParticipantRole | undefined;
  nameColor?: string | undefined;
  joinedAt?: string | undefined;
}

/** 2d §2 / 2e §4. `dismissed` is the viewer's own strip state, not a group one. */
export interface DMPinnedMessageDTO {
  id: string;
  authorName: string;
  excerpt: string;
  dismissed: boolean;
}

export interface DMConversationDTO {
  id: string;
  type: DMConversationType;
  name: string | null;
  iconUrl: string | null;
  ownerId: string | null;
  lastMessageAt: string;
  participants: DMParticipantDTO[];
  lastMessage: DMMessagePayload | null;
  /**
   * Faz 1 §B3. Everything below is group management state. Every field is
   * optional: the same schema carries 1:1 conversations, and a client built
   * against the older payload must keep parsing this one.
   */
  /** The viewer's own role in this conversation. */
  role?: DMParticipantRole | undefined;
  /** The viewer's own notification tier (2f §2). `muted` is its derived mirror. */
  notifyLevel?: DMNotifyLevel | undefined;
  /** The viewer's own conversation pin (V3 / 2a §2). Valid on 1:1 DMs too. */
  pinnedAt?: string | null | undefined;
  description?: string | null | undefined;
  avatarColor?: string | null | undefined;
  permissions?: GroupPermissions | undefined;
  historyVisibility?: GroupHistoryVisibility | undefined;
  /**
   * K3. The conversation's disappearing-message window. Carried here rather than
   * behind its own read because it is a plain column on the row this DTO is
   * already built from — no join, no extra statement.
   */
  disappearingAfter?: GroupDisappearingWindow | undefined;
  pinnedMessage?: DMPinnedMessageDTO | null | undefined;
  memberCount?: number | undefined;
  onlineCount?: number | undefined;
  /**
   * V7. The two crossed tiles a group row draws, plus the members they hide.
   * Resolved server-side so the row never has to walk `participants`.
   */
  avatarPair?: GroupAvatarTile[] | undefined;
  overflowCount?: number | undefined;
}

export const DMPresenceStatusSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);
export const DMConversationTypeSchema = z.enum(["DM", "GROUP_DM"]);

export const DMPresenceSchema = z.object({
  status: DMPresenceStatusSchema,
  customStatus: z.string().nullable(),
});

export const DMMessageAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  status: DMPresenceStatusSchema,
  customStatus: z.string().nullable(),
});

export const DMMessageAttachmentSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration: z.number().positive().nullable(),
  thumbnailUrl: z.string().nullable(),
  scanStatus: AttachmentScanStatusSchema.optional(),
});

export const DMReadReceiptSchema: z.ZodType<DMReadReceipt> = z.object({
  readerIds: z.array(z.string()),
  count: z.number().int().nonnegative(),
  everyone: z.boolean(),
});

export const DMMessagePayloadSchema: z.ZodType<DMMessagePayload> = z.lazy(() =>
  z.object({
    id: z.string(),
    conversationId: z.string(),
    userId: z.string(),
    content: z.string(),
    replyToId: z.string().nullable(),
    threadParentId: z.string().nullable(),
    alsoSentToChannel: z.boolean().optional(),
    threadSummary: MessageThreadSummarySchema.optional(),
    forwardedAt: z.string().nullable().optional(),
    editedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    deletedById: z.string().nullable(),
    createdAt: z.string(),
    author: DMMessageAuthorSchema,
    attachments: z.array(DMMessageAttachmentSchema, { error: "Expected array" }),
    reactions: z.array(MessageReactionSchema, { error: "Expected array" }),
    replyTo: DMMessagePayloadSchema.nullable(),
    poll: PollDTOSchema.nullable().optional(),
    deliveryStatus: z.enum(["sending", "failed"]).optional(),
    clientNonce: z.string().min(1).max(128).nullable().optional(),
    systemType: DMSystemMessageTypeSchema.nullable().default(null),
    systemTargetUserIds: z.array(z.string()).default([]),
    systemValue: z.string().nullable().default(null),
    readReceipt: DMReadReceiptSchema.optional(),
    expiresAt: z.string().nullable().optional(),
  }),
);

export const DMParticipantDTOSchema: z.ZodType<DMParticipantDTO> = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
  mentionCount: z.number().int().nonnegative().optional(),
  muted: z.boolean(),
  lastSeenAt: z.string().nullable().optional(),
  status: DMPresenceStatusSchema,
  customStatus: z.string().nullable(),
  presence: DMPresenceSchema,
  role: DMParticipantRoleSchema.optional(),
  nameColor: z.string().optional(),
  joinedAt: z.string().optional(),
});

export const DMPinnedMessageDTOSchema: z.ZodType<DMPinnedMessageDTO> = z.object({
  id: z.string(),
  authorName: z.string(),
  excerpt: z.string(),
  dismissed: z.boolean(),
});

export const DMGroupAvatarTileSchema: z.ZodType<GroupAvatarTile> = z.object({
  accent: z.string(),
  avatarUrl: z.string().nullable(),
  initials: z.string(),
  userId: z.string(),
});

export const DMConversationDTOSchema: z.ZodType<DMConversationDTO> = z.object({
  id: z.string(),
  type: DMConversationTypeSchema,
  name: z.string().nullable(),
  iconUrl: z.string().nullable(),
  ownerId: z.string().nullable(),
  lastMessageAt: z.string(),
  participants: z.array(DMParticipantDTOSchema),
  lastMessage: DMMessagePayloadSchema.nullable(),
  role: DMParticipantRoleSchema.optional(),
  notifyLevel: DMNotifyLevelSchema.optional(),
  pinnedAt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  avatarColor: z.string().nullable().optional(),
  permissions: GroupPermissionsSchema.optional(),
  historyVisibility: GroupHistoryVisibilitySchema.optional(),
  disappearingAfter: GroupDisappearingWindowSchema.optional(),
  pinnedMessage: DMPinnedMessageDTOSchema.nullable().optional(),
  memberCount: z.number().int().nonnegative().optional(),
  onlineCount: z.number().int().nonnegative().optional(),
  avatarPair: z.array(DMGroupAvatarTileSchema).optional(),
  overflowCount: z.number().int().nonnegative().optional(),
});
