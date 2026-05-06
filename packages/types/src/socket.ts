import { z } from "zod";
import {
  MessageReactionSchema,
  MessageThreadSummarySchema,
  type MessageReaction,
  type MessageThreadSummary,
} from "./messages";

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
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
}

export interface DMMessagePayload {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  threadParentId: string | null;
  threadSummary?: MessageThreadSummary | undefined;
  editedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  createdAt: string;
  author: DMMessageAuthorPayload;
  attachments: DMMessageAttachmentPayload[];
  reactions: MessageReaction[];
  replyTo: DMMessagePayload | null;
}

export interface DMParticipantDTO extends DMPresence {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  presence: DMPresence;
}

export interface DMConversationDTO {
  id: string;
  type: DMConversationType;
  name: string | null;
  lastMessageAt: string;
  participants: DMParticipantDTO[];
  lastMessage: DMMessagePayload | null;
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
  url: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration: z.number().positive().nullable(),
  thumbnailUrl: z.string().nullable(),
});

export const DMMessagePayloadSchema: z.ZodType<DMMessagePayload> = z.lazy(() =>
  z.object({
    id: z.string(),
    conversationId: z.string(),
    userId: z.string(),
    content: z.string(),
    replyToId: z.string().nullable(),
    threadParentId: z.string().nullable(),
    threadSummary: MessageThreadSummarySchema.optional(),
    editedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    deletedById: z.string().nullable(),
    createdAt: z.string(),
    author: DMMessageAuthorSchema,
    attachments: z.array(DMMessageAttachmentSchema),
    reactions: z.array(MessageReactionSchema),
    replyTo: DMMessagePayloadSchema.nullable(),
  }),
);

export const DMParticipantDTOSchema: z.ZodType<DMParticipantDTO> = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
  status: DMPresenceStatusSchema,
  customStatus: z.string().nullable(),
  presence: DMPresenceSchema,
});

export const DMConversationDTOSchema: z.ZodType<DMConversationDTO> = z.object({
  id: z.string(),
  type: DMConversationTypeSchema,
  name: z.string().nullable(),
  lastMessageAt: z.string(),
  participants: z.array(DMParticipantDTOSchema),
  lastMessage: DMMessagePayloadSchema.nullable(),
});
