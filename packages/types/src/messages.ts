import { z } from "zod";

export const MESSAGE_CONTENT_HARD_LIMIT = 40000;
export const MESSAGE_CONTENT_DEFAULT_LIMIT = 2000;

export const MessageAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]).optional(),
  customStatus: z.string().nullable().optional(),
});

export const MessageReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().positive(),
  userIds: z.array(z.string()),
});

export const MessageAttachmentSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().positive(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  duration: z.number().positive().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
});

export const MessageThreadParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const MessageThreadSummarySchema = z.object({
  replyCount: z.number().int().nonnegative(),
  lastReplyAt: z.string().datetime().nullable(),
  recentRepliers: z.array(MessageThreadParticipantSchema),
});

export const UploadedAttachmentInputSchema = z.object({
  id: z.string().uuid(),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
});

export const ReplyToSchema = z.object({
  id: z.string(),
  authorName: z.string(),
  content: z.string(),
});

export const ChatMessageTypeSchema = z.enum([
  "DEFAULT",
  "SYSTEM_JOIN",
  "SYSTEM_LEAVE",
]);

export const ChatMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  author: MessageAuthorSchema,
  content: z.string(),
  type: ChatMessageTypeSchema,
  threadParentId: z.string().nullable().optional(),
  threadSummary: MessageThreadSummarySchema.optional(),
  isPinned: z.boolean().optional(),
  pinnedAt: z.string().datetime().nullable().optional(),
  pinnedById: z.string().nullable().optional(),
  reactions: z.array(MessageReactionSchema).default([]),
  attachments: z.array(MessageAttachmentSchema).default([]),
  replyTo: ReplyToSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  deliveryStatus: z.enum(["sending", "failed"]).optional(),
  errorMessage: z.string().optional(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  deletedById: z.string().nullable().optional(),
});

export const MessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const MessageSearchScopeSchema = z.enum(["channel", "dm"]);

export const MessageSearchResultSchema = z.object({
  id: z.string(),
  scope: MessageSearchScopeSchema,
  messageId: z.string(),
  channelId: z.string().nullable().optional(),
  channelName: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  serverId: z.string().nullable().optional(),
  author: MessageAuthorSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const MessageSearchResponseSchema = z.object({
  results: z.array(MessageSearchResultSchema),
  nextCursor: z.string().nullable(),
});

export const SendMessageInputSchema = z.object({
  channelId: z.string(),
  content: z.string().max(MESSAGE_CONTENT_HARD_LIMIT),
  replyToId: z.string().optional(),
  threadParentId: z.string().optional(),
  attachments: z.array(UploadedAttachmentInputSchema).max(5).default([]),
}).refine(
  (value) => value.content.trim().length > 0 || value.attachments.length > 0,
  {
    message: "Message content or attachment is required",
    path: ["content"],
  },
);

export const EditMessageInputSchema = z.object({
  messageId: z.string(),
  content: z.string().min(1).max(MESSAGE_CONTENT_HARD_LIMIT),
});

export type MessageAuthor = z.infer<typeof MessageAuthorSchema>;
export type MessageReaction = z.infer<typeof MessageReactionSchema>;
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;
export type MessageThreadParticipant = z.infer<typeof MessageThreadParticipantSchema>;
export type MessageThreadSummary = z.infer<typeof MessageThreadSummarySchema>;
export type UploadedAttachmentInput = z.infer<typeof UploadedAttachmentInputSchema>;
export type ReplyTo = z.infer<typeof ReplyToSchema>;
export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
export type MessageSearchScope = z.infer<typeof MessageSearchScopeSchema>;
export type MessageSearchResult = z.infer<typeof MessageSearchResultSchema>;
export type MessageSearchResponse = z.infer<typeof MessageSearchResponseSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type EditMessageInput = z.infer<typeof EditMessageInputSchema>;
