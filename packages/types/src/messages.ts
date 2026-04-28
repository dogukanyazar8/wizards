import { z } from "zod";

export const MessageAuthorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
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
  reactions: z.array(MessageReactionSchema).default([]),
  attachments: z.array(MessageAttachmentSchema).default([]),
  replyTo: ReplyToSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});

export const MessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const SendMessageInputSchema = z.object({
  channelId: z.string(),
  content: z.string().max(2000),
  replyToId: z.string().optional(),
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
  content: z.string().min(1).max(2000),
});

export type MessageAuthor = z.infer<typeof MessageAuthorSchema>;
export type MessageReaction = z.infer<typeof MessageReactionSchema>;
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;
export type UploadedAttachmentInput = z.infer<typeof UploadedAttachmentInputSchema>;
export type ReplyTo = z.infer<typeof ReplyToSchema>;
export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type EditMessageInput = z.infer<typeof EditMessageInputSchema>;
