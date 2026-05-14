import { ChannelType, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import {
  isMessageGifContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { ensureChannelMembership } from "@/lib/socket/channel-membership";
import type { HandlerContext } from "@/lib/socket/context";
import { emitToChannelViewers } from "@/lib/socket/emitters";
import { createSocketErrorEmitter } from "@/lib/socket/errors";
import {
  checkChannelMessageEditRateLimit,
  checkChannelMessageRateLimit,
  shouldLogRateLimitUnavailable,
} from "@/lib/socket/rate-limits";
import {
  parseSocketPayload,
  SocketIdSchema,
  SocketMessageEditPayloadSchema,
  SocketMessageReactionPayloadSchema,
  SocketMessageSendPayloadSchema,
} from "@/lib/socket/schemas";
import {
  createChannelMentionNotifications,
  createChannelThreadReplyNotification,
} from "@/lib/workspace/message-notification-service";
import {
  createMessage,
  deleteMessage,
  editMessage,
  setReaction,
} from "@/lib/workspace/message-service";
import {
  filterUserIdsByChannelPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { recordMessageSendFanoutMetric } from "@/lib/workspace/performance-metrics";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  getActiveServerMemberUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { hasPermission, PermissionBits } from "@/lib/workspace/permissions";

import type { SocketHandlerRegistration } from ".";

type CheckChannelMessageRateLimit = typeof checkChannelMessageRateLimit;
type CheckChannelMessageEditRateLimit = typeof checkChannelMessageEditRateLimit;

export function deriveMessageSendFanoutTargets(args: {
  activeChannelViewerCandidateUserIds: string[];
  activeServerMemberUserIds: string[];
  permittedActiveUserIds: string[];
  senderId: string;
}) {
  const permittedActiveUserIdSet = new Set(args.permittedActiveUserIds);
  const activeChannelViewerUserIds = args.activeChannelViewerCandidateUserIds.filter(
    (viewerUserId) => permittedActiveUserIdSet.has(viewerUserId),
  );
  const readUserIds = Array.from(new Set([args.senderId, ...activeChannelViewerUserIds]));
  const readUserIdSet = new Set(readUserIds);
  const permittedUnreadUserIds = args.activeServerMemberUserIds.filter((memberUserId) =>
    permittedActiveUserIdSet.has(memberUserId),
  );
  const unreadUpdateUserIds = permittedUnreadUserIds.filter(
    (memberUserId) => !readUserIdSet.has(memberUserId),
  );

  return {
    activeChannelViewerUserIds,
    permittedUnreadUserIds,
    readUserIds,
    unreadUpdateUserIds,
  };
}

export function registerMessageHandlers(
  ctx: HandlerContext,
  options: {
    checkChannelMessageEditRateLimit?: CheckChannelMessageEditRateLimit;
    checkChannelMessageRateLimit?: CheckChannelMessageRateLimit;
  } = {},
): SocketHandlerRegistration {
  const { io, redis, socket, userId } = ctx;
  const emitSocketError = createSocketErrorEmitter(socket);
  const checkMessageSendRateLimit =
    options.checkChannelMessageRateLimit ?? checkChannelMessageRateLimit;
  const checkMessageEditRateLimit =
    options.checkChannelMessageEditRateLimit ?? checkChannelMessageEditRateLimit;

  socket.on("message:send", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageSendPayloadSchema, rawData);

      const rateLimitResult = await checkMessageSendRateLimit({ redis, userId });
      if (rateLimitResult.status === "limited") {
        socket.emit("error", {
          code: "RATE_LIMIT",
          message: "Too many messages. Maximum 30 per minute.",
        });
        return;
      }

      if (
        rateLimitResult.status === "unavailable" &&
        shouldLogRateLimitUnavailable("channel-message")
      ) {
        logError(
          "[socket] Message rate limit unavailable; allowing message send",
          rateLimitResult.error,
        );
      }

      const { channel, permissions } = await requireChannelPermissionForUser(
        userId,
        data.channelId,
        PermissionBits.SEND_MESSAGES,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You cannot send messages in this channel.",
          lockedCode: "CHANNEL_LOCKED",
          lockedMessage: "This channel is read-only.",
          requiredType: ChannelType.TEXT,
          respectLocked: true,
        },
      );

      const canBypassMessageLimit = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

      const attachmentInputs = parseUploadedAttachmentInputs(data.attachments);
      const mediaSettings = getServerMediaSettings(channel.server.features);

      if (attachmentInputs.length > 0) {
        const attachments = await prisma.attachment.findMany({
          where: {
            id: { in: attachmentInputs.map((attachment) => attachment.id) },
            userId,
          },
          select: {
            contentType: true,
          },
        });

        if (
          !mediaSettings.allowGifs &&
          attachments.some((attachment) => isMessageGifContentType(attachment.contentType))
        ) {
          throw new ApiError("GIFs are disabled for this server.", 403, "GIFS_DISABLED");
        }

        if (
          !hasPermission(permissions, PermissionBits.USE_GIFS) &&
          attachments.some((attachment) => isMessageGifContentType(attachment.contentType))
        ) {
          throw new ApiError("You cannot send GIFs in this channel.", 403, "GIFS_FORBIDDEN");
        }

        if (
          !mediaSettings.allowFileUploads &&
          attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))
        ) {
          throw new ApiError(
            "File uploads are disabled for this server.",
            403,
            "FILE_UPLOADS_DISABLED",
          );
        }

        if (
          !hasPermission(permissions, PermissionBits.ATTACH_FILES) &&
          attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))
        ) {
          throw new ApiError(
            "You cannot attach files in this channel.",
            403,
            "ATTACHMENTS_FORBIDDEN",
          );
        }
      }

      const content = normalizeMessageContentForSend(
        data.content,
        attachmentInputs,
        canBypassMessageLimit ? null : channel.server.messageCharacterLimit,
      );
      const message = await createMessage(
        data.channelId,
        userId,
        content,
        data.replyToId,
        attachmentInputs,
        data.threadParentId,
        { permissions },
      );
      const messageCreatedAt = new Date(message.createdAt);
      const [activeChannelViewerCandidateUserIds, activeServerMemberUserIds] = await Promise.all([
        getActiveChannelViewerUserIds(data.channelId),
        getActiveServerMemberUserIds(channel.serverId),
      ]);
      const permittedActiveUserIds = await filterUserIdsByChannelPermission(
        data.channelId,
        [...activeChannelViewerCandidateUserIds, ...activeServerMemberUserIds],
        PermissionBits.VIEW_CHANNEL,
      );
      const {
        activeChannelViewerUserIds,
        permittedUnreadUserIds,
        readUserIds,
        unreadUpdateUserIds,
      } = deriveMessageSendFanoutTargets({
        activeChannelViewerCandidateUserIds,
        activeServerMemberUserIds,
        permittedActiveUserIds,
        senderId: userId,
      });

      if (unreadUpdateUserIds.length > 0) {
        io.to(unreadUpdateUserIds.map((memberUserId) => `user:${memberUserId}`)).emit(
          "channel:messages:stale",
          {
            channelId: data.channelId,
            latestMessageId: message.id,
            serverId: channel.serverId,
          },
        );
      }

      if (activeChannelViewerUserIds.length > 0) {
        io.to(activeChannelViewerUserIds.map((viewerUserId) => `user:${viewerUserId}`)).emit(
          "message:new",
          message,
        );
      }

      void (async () => {
        await markChannelReadStates({
          channelId: data.channelId,
          lastReadAt: messageCreatedAt,
          lastReadMessageId: message.id,
          userIds: readUserIds,
        });
        await emitServerUnreadUpdatesForServer(channel.serverId, unreadUpdateUserIds);
      })().catch((error) => {
        logError("[socket] Message unread state update failed", error);
      });

      recordMessageSendFanoutMetric({
        activeChannelViewerCount: activeChannelViewerCandidateUserIds.length,
        activeServerMemberCount: activeServerMemberUserIds.length,
        permittedChannelViewerCount: activeChannelViewerUserIds.length,
        permittedUnreadUserCount: permittedUnreadUserIds.length,
        readUserCount: readUserIds.length,
        unreadUpdateUserCount: unreadUpdateUserIds.length,
      });
      void createChannelMentionNotifications({
        channelId: data.channelId,
        channelName: channel.name,
        content,
        io,
        messageId: message.id,
        senderId: userId,
        senderName: message.author.displayName ?? message.author.username,
        serverId: channel.serverId,
        skipUserIds: readUserIds,
      }).catch((error) => {
        logError("[socket] Message mention notification failed", error);
      });
      if (data.threadParentId) {
        void createChannelThreadReplyNotification({
          channelId: data.channelId,
          channelName: channel.name,
          content,
          io,
          parentMessageId: data.threadParentId,
          senderId: userId,
          senderName: message.author.displayName ?? message.author.username,
          serverId: channel.serverId,
        }).catch((error) => {
          logError("[socket] Message thread reply notification failed", error);
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        socket.emit("error", {
          code: error.code ?? "MESSAGE_VALIDATION_ERROR",
          message: error.message,
        });
        return;
      }

      emitSocketError("MESSAGE_SEND_ERROR", "Unable to send message.", error);
    }
  });

  socket.on("message:edit", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageEditPayloadSchema, rawData);
      const rateLimitResult = await checkMessageEditRateLimit({ redis, userId });
      if (rateLimitResult.status === "limited") {
        socket.emit("error", {
          code: "RATE_LIMIT",
          message: "Too many message edits. Maximum 30 per minute.",
        });
        return;
      }

      if (
        rateLimitResult.status === "unavailable" &&
        shouldLogRateLimitUnavailable("channel-message-edit")
      ) {
        logError(
          "[socket] Message edit rate limit unavailable; allowing message edit",
          rateLimitResult.error,
        );
      }

      const existing = await prisma.message.findUnique({
        where: { id: data.messageId },
        select: {
          channelId: true,
          channel: {
            select: {
              server: {
                select: {
                  messageCharacterLimit: true,
                  ownerId: true,
                },
              },
              serverId: true,
            },
          },
        },
      });

      if (!existing?.channel.serverId || !existing.channel.server) {
        socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
        return;
      }

      const { permissions } = await requireChannelPermissionForUser(
        userId,
        existing.channelId,
        PermissionBits.SEND_MESSAGES,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "Cannot edit this message",
          lockedCode: "CHANNEL_LOCKED",
          lockedMessage: "This channel is read-only.",
          requiredType: ChannelType.TEXT,
          respectLocked: true,
        },
      );
      const canBypassMessageLimit = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

      const message = await editMessage(
        data.messageId,
        userId,
        data.content,
        canBypassMessageLimit ? null : existing.channel.server.messageCharacterLimit,
      );
      await emitToChannelViewers(io, message.channelId, "message:updated", message);
    } catch (error) {
      emitSocketError("MESSAGE_EDIT_ERROR", "Unable to edit message.", error);
    }
  });

  socket.on("message:delete", async (rawMessageId: string) => {
    try {
      const messageId = parseSocketPayload(SocketIdSchema, rawMessageId);
      const dbMessage = await prisma.message.findFirst({
        where: { id: messageId, placeholderRemovedAt: null },
        select: {
          channelId: true,
          isPinned: true,
          userId: true,
          channel: {
            select: {
              serverId: true,
              server: { select: { ownerId: true } },
            },
          },
        },
      });

      if (!dbMessage?.channel.serverId) {
        socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
        return;
      }

      const { permissions } = await requireChannelPermissionForUser(
        userId,
        dbMessage.channelId,
        PermissionBits.VIEW_CHANNEL,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You do not have access to this channel.",
          requiredType: ChannelType.TEXT,
        },
      );
      const isAdmin = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

      const deleteResult = await deleteMessage(messageId, userId, isAdmin);

      if (deleteResult.status === "removed") {
        await emitToChannelViewers(io, dbMessage.channelId, "message:removed", {
          messageId,
          channelId: dbMessage.channelId,
        });
      } else {
        await emitToChannelViewers(io, dbMessage.channelId, "message:deleted", {
          messageId,
          channelId: dbMessage.channelId,
          deletedById: userId,
          placeholderExpiresAt: deleteResult.placeholderExpiresAt,
        });
      }

      if (dbMessage.isPinned) {
        await emitToChannelViewers(io, dbMessage.channelId, "message:pins_updated", {
          channelId: dbMessage.channelId,
        });
      }
    } catch (error) {
      emitSocketError("MESSAGE_DELETE_ERROR", "Unable to delete message.", error);
    }
  });

  socket.on("message:react", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
      const message = await prisma.message.findFirst({
        where: { deletedAt: null, id: data.messageId, placeholderRemovedAt: null },
        select: { channelId: true },
      });

      if (!message) {
        socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
        return;
      }

      await ensureChannelMembership(userId, message.channelId);
      const reactions = await setReaction(data.messageId, userId, data.emoji, true);
      await emitToChannelViewers(io, message.channelId, "message:reaction_updated", {
        messageId: data.messageId,
        reactions,
      });
    } catch (error) {
      emitSocketError("MESSAGE_REACT_ERROR", "Unable to update reactions.", error);
    }
  });

  socket.on("message:unreact", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
      const message = await prisma.message.findFirst({
        where: { deletedAt: null, id: data.messageId, placeholderRemovedAt: null },
        select: { channelId: true },
      });

      if (!message) {
        socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
        return;
      }

      await ensureChannelMembership(userId, message.channelId);
      const reactions = await setReaction(data.messageId, userId, data.emoji, false);
      await emitToChannelViewers(io, message.channelId, "message:reaction_updated", {
        messageId: data.messageId,
        reactions,
      });
    } catch (error) {
      emitSocketError("MESSAGE_UNREACT_ERROR", "Unable to update reactions.", error);
    }
  });

  return {};
}
