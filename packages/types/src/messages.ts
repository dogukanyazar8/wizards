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

export const ReplyToSchema = z.object({
  id: z.string(),
  authorName: z.string(),
  content: z.string(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  author: MessageAuthorSchema,
  content: z.string(),
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
  content: z.string().min(1).max(2000),
  replyToId: z.string().optional(),
});

export const EditMessageInputSchema = z.object({
  messageId: z.string(),
  content: z.string().min(1).max(2000),
});

export type MessageAuthor = z.infer<typeof MessageAuthorSchema>;
export type MessageReaction = z.infer<typeof MessageReactionSchema>;
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;
export type ReplyTo = z.infer<typeof ReplyToSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type EditMessageInput = z.infer<typeof EditMessageInputSchema>;
