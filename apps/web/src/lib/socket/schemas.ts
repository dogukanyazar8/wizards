import {
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MESSAGE_CONTENT_HARD_LIMIT,
  UploadedAttachmentInputSchema,
} from "@wizards/types";
import { z } from "zod";
import { ApiError } from "../api";

const SOCKET_ID_MAX_LENGTH = 128;
const SOCKET_CHANNEL_MESSAGE_MAX_LENGTH = MESSAGE_CONTENT_HARD_LIMIT;
const SOCKET_DM_MESSAGE_MAX_LENGTH = MESSAGE_CONTENT_DEFAULT_LIMIT;
const SOCKET_EMOJI_MAX_LENGTH = 64;
const SOCKET_ATTACHMENT_MAX_COUNT = 5;

export const SocketIdSchema = z.string().trim().min(1).max(SOCKET_ID_MAX_LENGTH);

const SocketOptionalIdSchema = SocketIdSchema.optional();

export const SocketMessageSendPayloadSchema = z
  .object({
    alsoSendToChannel: z.boolean().optional(),
    attachments: z.array(UploadedAttachmentInputSchema).max(SOCKET_ATTACHMENT_MAX_COUNT).optional(),
    channelId: SocketIdSchema,
    content: z.string().max(SOCKET_CHANNEL_MESSAGE_MAX_LENGTH),
    replyToId: SocketOptionalIdSchema,
    threadParentId: SocketOptionalIdSchema,
  })
  .strict();

export const SocketDMMessageSendPayloadSchema = z
  .object({
    attachments: z.array(UploadedAttachmentInputSchema).max(SOCKET_ATTACHMENT_MAX_COUNT).optional(),
    conversationId: SocketIdSchema,
    content: z.string().max(SOCKET_DM_MESSAGE_MAX_LENGTH),
    replyToId: SocketOptionalIdSchema,
    threadParentId: SocketOptionalIdSchema,
  })
  .strict();

export const SocketMessageEditPayloadSchema = z
  .object({
    content: z.string().trim().min(1).max(SOCKET_CHANNEL_MESSAGE_MAX_LENGTH),
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

export const SocketDMCallStartPayloadSchema = z
  .object({
    conversationId: SocketIdSchema,
    video: z.boolean(),
  })
  .strict();

export const SocketDMCallAcceptPayloadSchema = z
  .object({
    conversationId: SocketIdSchema,
    fromUserId: SocketIdSchema,
    video: z.boolean(),
  })
  .strict();

export const SocketDMCallTargetPayloadSchema = z
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

export const SocketVoiceChannelPayloadSchema = z
  .object({
    channelId: SocketIdSchema,
    serverId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceStatesWatchPayloadSchema = z
  .object({
    serverId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceAudioLevelPayloadSchema = z
  .object({
    audioLevel: z.number().finite().min(0).max(1),
    channelId: SocketIdSchema,
    isMuted: z.boolean(),
    isSpeaking: z.boolean(),
    serverId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceInvitePayloadSchema = z
  .object({
    channelId: SocketIdSchema,
    serverId: SocketIdSchema,
    targetUserId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceInviteAcceptPayloadSchema = z
  .object({
    channelId: SocketIdSchema,
    inviteId: SocketIdSchema,
    serverId: SocketIdSchema,
  })
  .strict();

export const SocketVoiceInviteDeclinePayloadSchema = SocketVoiceInviteAcceptPayloadSchema;

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
