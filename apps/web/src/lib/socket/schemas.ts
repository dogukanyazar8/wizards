import { UploadedAttachmentInputSchema } from "@wizards/types";
import { z } from "zod";
import { ApiError } from "../api";

const SOCKET_ID_MAX_LENGTH = 128;
const SOCKET_MESSAGE_MAX_LENGTH = 2000;
const SOCKET_EMOJI_MAX_LENGTH = 64;
const SOCKET_ATTACHMENT_MAX_COUNT = 5;

export const SocketIdSchema = z.string().trim().min(1).max(SOCKET_ID_MAX_LENGTH);

const SocketOptionalIdSchema = SocketIdSchema.optional();

export const SocketMessageSendPayloadSchema = z
  .object({
    attachments: z.array(UploadedAttachmentInputSchema).max(SOCKET_ATTACHMENT_MAX_COUNT).optional(),
    channelId: SocketIdSchema,
    content: z.string().max(SOCKET_MESSAGE_MAX_LENGTH),
    replyToId: SocketOptionalIdSchema,
    threadParentId: SocketOptionalIdSchema,
  })
  .strict();

export const SocketDMMessageSendPayloadSchema = z
  .object({
    attachments: z.array(UploadedAttachmentInputSchema).max(SOCKET_ATTACHMENT_MAX_COUNT).optional(),
    conversationId: SocketIdSchema,
    content: z.string().max(SOCKET_MESSAGE_MAX_LENGTH),
    replyToId: SocketOptionalIdSchema,
    threadParentId: SocketOptionalIdSchema,
  })
  .strict();

export const SocketMessageEditPayloadSchema = z
  .object({
    content: z.string().trim().min(1).max(SOCKET_MESSAGE_MAX_LENGTH),
    messageId: SocketIdSchema,
  })
  .strict();

export const SocketMessageReactionPayloadSchema = z
  .object({
    emoji: z.string().trim().min(1).max(SOCKET_EMOJI_MAX_LENGTH),
    messageId: SocketIdSchema,
  })
  .strict();

export const SocketMessageDeletePayloadSchema = z
  .object({
    messageId: SocketIdSchema,
  })
  .strict();

export const SocketConversationPayloadSchema = z
  .object({
    conversationId: SocketIdSchema,
  })
  .strict();

export const SocketDMScreenShareTargetPayloadSchema = z
  .object({
    conversationId: SocketIdSchema,
    fromUserId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceScreenSharePayloadSchema = z
  .object({
    channelId: SocketIdSchema,
    isScreenSharing: z.boolean(),
    serverId: SocketIdSchema,
  })
  .strict();

export const SocketPresenceActivityPayloadSchema = z
  .object({
    status: z.enum(["ONLINE", "IDLE"]),
  })
  .strict();

export function parseSocketPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("Invalid socket payload.", 400, "VALIDATION_ERROR");
  }

  return parsed.data;
}
