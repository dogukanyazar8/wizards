import { ChannelType, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { UNKNOWN_ATTRIBUTION } from "@/lib/analytics/client-attribution";
import { logError } from "@/lib/logger";
import {
  isMessageGifContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import type { HandlerContext } from "@/lib/socket/context";
import type { MessageSendAck } from "@/lib/socket/events";
import {
  emitToChannelViewers,
  emitToUserRooms,
  getPermittedChannelViewerUserIds,
} from "@/lib/socket/emitters";
import { createSocketErrorEmitter } from "@/lib/socket/errors";
import {
  checkChannelMessageEditRateLimit,
  checkChannelMessageRateLimit,
  type checkChannelSlowMode,
  type ChannelSlowModeResult,
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
  createMessageWithClientNonce,
  deleteMessage,
  editMessage,
  setReaction,
} from "@/lib/workspace/message-service";
import { assertMemberNotTimedOut } from "@/lib/workspace/member-timeout";
import { checkEffectiveChannelSlowMode } from "@/lib/workspace/channel-slow-mode";
import { toMobileChannelMessagePreview } from "@/lib/workspace/mobile-channel-message-preview";
import {
  PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS,
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
type CheckChannelSlowMode = typeof checkChannelSlowMode;

function createMessageSendAcknowledger(acknowledge?: (result: MessageSendAck) => void) {
  let acknowledged = false;

  return (result: MessageSendAck) => {
    if (acknowledged) {
      return;
    }

    acknowledged = true;
    acknowledge?.(result);
  };
}

/**
 * Ş1 §2. Gövde `@/lib/workspace/channel-slow-mode`'a taşındı: mobil REST yolu
 * aynı kapıdan geçmek zorunda ve bir soket işleyicisinden içe aktarmak katman
 * sınırını ters yöne geçerdi. İmza artık ham `delaySeconds` değil iki süreyi
 * alıyor — etkin süreyi çağıranın hesaplaması, bir yolun sunucu ayarını
 * unutabilmesi demekti.
 */
export async function checkChannelSlowModeForSend(args: {
  channelDelaySeconds: number;
  channelId: string;
  check?: CheckChannelSlowMode;
  permissions: bigint;
  redis: HandlerContext["rateRedis"];
  serverDelaySeconds: number;
  userId: string;
}): Promise<ChannelSlowModeResult> {
  return checkEffectiveChannelSlowMode({
    channelDelaySeconds: args.channelDelaySeconds,
    channelId: args.channelId,
    ...(args.check ? { check: args.check } : {}),
    permissions: args.permissions,
    redis: args.redis,
    serverDelaySeconds: args.serverDelaySeconds,
    userId: args.userId,
  });
}

export function requireChannelReactionPermission(
  userId: string,
  channelId: string,
  check: typeof requireChannelPermissionForUser = requireChannelPermissionForUser,
) {
  // Reactions contribute to a conversation, so read-only and locked channels
  // use the same write gate as sending a message.
  return check(userId, channelId, PermissionBits.SEND_MESSAGES, { respectLocked: true });
}

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
    assertMemberNotTimedOut?: typeof assertMemberNotTimedOut;
    checkChannelMessageEditRateLimit?: CheckChannelMessageEditRateLimit;
    checkChannelMessageRateLimit?: CheckChannelMessageRateLimit;
    checkChannelSlowMode?: CheckChannelSlowMode;
    requireChannelPermissionForUser?: typeof requireChannelPermissionForUser;
  } = {},
): SocketHandlerRegistration {
  const { io, rateRedis, socket, userId } = ctx;
  const emitSocketError = createSocketErrorEmitter(socket);
  const checkMessageSendRateLimit =
    options.checkChannelMessageRateLimit ?? checkChannelMessageRateLimit;
  const checkMessageEditRateLimit =
    options.checkChannelMessageEditRateLimit ?? checkChannelMessageEditRateLimit;
  const requireMessageChannelPermission =
    options.requireChannelPermissionForUser ?? requireChannelPermissionForUser;
  const requireMemberNotTimedOut = options.assertMemberNotTimedOut ?? assertMemberNotTimedOut;

  socket.on("message:send", async (rawData, rawAcknowledge) => {
    const acknowledge = createMessageSendAcknowledger(rawAcknowledge);
    const fail = (code: string, message: string, retryAfterSeconds?: number) => {
      socket.emit("error", {
        code,
        message,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
      acknowledge({ code, message, ok: false });
    };

    try {
      const data = parseSocketPayload(SocketMessageSendPayloadSchema, rawData);

      const rateLimitResult = await checkMessageSendRateLimit({ redis: rateRedis, userId });
      if (rateLimitResult.status === "limited") {
        fail("RATE_LIMIT", "Too many messages. Maximum 30 per minute.");
        return;
      }

      if (rateLimitResult.status === "unavailable") {
        if (shouldLogRateLimitUnavailable("channel-message")) {
          logError(
            rateLimitResult.allowDuringGrace
              ? "[socket] Message rate limit unavailable; allowing message send during grace window"
              : "[socket] Message rate limit unavailable; blocking message send",
            rateLimitResult.error,
          );
        }

        if (!rateLimitResult.allowDuringGrace) {
          fail(
            "RATE_LIMIT_UNAVAILABLE",
            "Message controls are temporarily unavailable. Please try again shortly.",
          );
          return;
        }
      }

      const { channel, permissions } = await requireMessageChannelPermission(
        userId,
        data.channelId,
        PermissionBits.SEND_MESSAGES,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You cannot send messages in this channel.",
          lockedCode: "CHANNEL_LOCKED",
          lockedMessage: "This channel is read-only.",
          cacheMaxAgeSeconds: PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS,
          requiredType: ChannelType.TEXT,
          respectLocked: true,
        },
      );

      // Web gönderimi soketten geçiyor: kapı yalnız HTTP yolunda dursaydı zaman aşımı
      // tarayıcıda hiç uygulanmazdı (Ş2 §4).
      await requireMemberNotTimedOut(channel.serverId, userId);

      const canBypassMessageLimit = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);
      const slowModeResult = await checkChannelSlowModeForSend({
        channelDelaySeconds: channel.slowModeDelay,
        channelId: data.channelId,
        ...(options.checkChannelSlowMode ? { check: options.checkChannelSlowMode } : {}),
        permissions,
        redis: rateRedis,
        serverDelaySeconds: channel.server.slowModeDelay,
        userId,
      });
      if (slowModeResult.status === "limited") {
        fail(
          "SLOW_MODE",
          "Slow mode is active. Please wait before sending another message.",
          slowModeResult.retryAfterSeconds,
        );
        return;
      }
      if (slowModeResult.status === "unavailable") {
        logError(
          "[socket] Channel slow mode unavailable; blocking message send",
          slowModeResult.error,
        );
        fail(
          "RATE_LIMIT_UNAVAILABLE",
          "Message controls are temporarily unavailable. Please try again shortly.",
        );
        return;
      }

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
      const { deduplicated, message } = await createMessageWithClientNonce(
        data.channelId,
        userId,
        content,
        data.replyToId,
        attachmentInputs,
        data.threadParentId,
        {
          alsoSendToChannel: data.alsoSendToChannel === true,
          attribution: socket.data.clientAttribution ?? UNKNOWN_ATTRIBUTION,
          clientNonce: data.clientNonce ?? null,
          // Same transaction as the message row; the fan-out below no longer
          // decides whether anyone is told about it.
          notification: { channelName: channel.name, serverId: channel.serverId },
          permissions,
        },
      );

      // The author's echo goes first, straight after the commit.
      //
      // It used to be emitted from inside the fan-out below, so the sender's own
      // bubble waited on two presence lookups and a permission filter across
      // every active member — work that is about other people's screens. The
      // nonce goes to the author and nobody else: it is the key to their
      // optimistic bubble and means nothing to any other viewer's cache.
      io.to(`user:${userId}`).emit(
        "message:new",
        data.clientNonce ? { ...message, clientNonce: data.clientNonce } : message,
      );
      acknowledge({ messageId: message.id, ok: true });

      if (deduplicated) {
        // A retry of a send that already landed. Everyone was told the first
        // time, and the echo above is the only thing this attempt owed.
        return;
      }

      const messageCreatedAt = new Date(message.createdAt);
      const fanoutStartedAt = Date.now();
      const presenceLookupStartedAt = Date.now();
      const [activeChannelViewerCandidateUserIds, activeServerMemberUserIds] = await Promise.all([
        getActiveChannelViewerUserIds(data.channelId),
        getActiveServerMemberUserIds(channel.serverId),
      ]);
      const presenceLookupDurationMs = Date.now() - presenceLookupStartedAt;
      const permissionFilterStartedAt = Date.now();
      const permittedActiveUserIds = await filterUserIdsByChannelPermission(
        data.channelId,
        [...activeChannelViewerCandidateUserIds, ...activeServerMemberUserIds],
        PermissionBits.VIEW_CHANNEL,
      );
      const permissionFilterDurationMs = Date.now() - permissionFilterStartedAt;
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

      const directEmitStartedAt = Date.now();
      if (unreadUpdateUserIds.length > 0) {
        io.to(unreadUpdateUserIds.map((memberUserId) => `user:${memberUserId}`)).emit(
          "channel:messages:stale",
          {
            channelId: data.channelId,
            lastMessage: toMobileChannelMessagePreview(message),
            latestMessageId: message.id,
            serverId: channel.serverId,
          },
        );
      }

      // The author is excluded: they already have their copy, with the nonce.
      const otherViewerIds = activeChannelViewerUserIds.filter(
        (viewerUserId) => viewerUserId !== userId,
      );
      if (otherViewerIds.length > 0) {
        io.to(otherViewerIds.map((viewerUserId) => `user:${viewerUserId}`)).emit(
          "message:new",
          redactMessageAttachmentUrlsForViewer(message, null),
        );
      }
      const directEmitDurationMs = Date.now() - directEmitStartedAt;

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
        directEmitDurationMs,
        fanoutDurationMs: Date.now() - fanoutStartedAt,
        permittedChannelViewerCount: activeChannelViewerUserIds.length,
        permittedUnreadUserCount: permittedUnreadUserIds.length,
        permissionFilterDurationMs,
        presenceLookupDurationMs,
        readUserCount: readUserIds.length,
        unreadUpdateUserCount: unreadUpdateUserIds.length,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        fail(error.code ?? "MESSAGE_VALIDATION_ERROR", error.message);
        return;
      }

      acknowledge({ code: "MESSAGE_SEND_ERROR", message: "Unable to send message.", ok: false });
      emitSocketError("MESSAGE_SEND_ERROR", "Unable to send message.", error);
    }
  });

  socket.on("message:edit", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketMessageEditPayloadSchema, rawData);
      const rateLimitResult = await checkMessageEditRateLimit({ redis: rateRedis, userId });
      if (rateLimitResult.status === "limited") {
        socket.emit("error", {
          code: "RATE_LIMIT",
          message: "Too many message edits. Maximum 30 per minute.",
        });
        return;
      }

      if (rateLimitResult.status === "unavailable") {
        if (shouldLogRateLimitUnavailable("channel-message-edit")) {
          logError(
            rateLimitResult.allowDuringGrace
              ? "[socket] Message edit rate limit unavailable; allowing message edit during grace window"
              : "[socket] Message edit rate limit unavailable; blocking message edit",
            rateLimitResult.error,
          );
        }

        if (!rateLimitResult.allowDuringGrace) {
          socket.emit("error", {
            code: "RATE_LIMIT_UNAVAILABLE",
            message: "Message edit controls are temporarily unavailable. Please try again shortly.",
          });
          return;
        }
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
          cacheMaxAgeSeconds: PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS,
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
        { permissions },
      );
      const viewerUserIds = await getPermittedChannelViewerUserIds(message.channelId);
      const ownerViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId === userId);
      const otherViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId !== userId);

      emitToUserRooms(io, ownerViewerIds, "message:updated", message);
      emitToUserRooms(
        io,
        otherViewerIds,
        "message:updated",
        redactMessageAttachmentUrlsForViewer(message, null),
      );
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
          cacheMaxAgeSeconds: PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS,
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You do not have access to this channel.",
          requiredType: ChannelType.TEXT,
        },
      );
      const isAdmin = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

      const deleteResult = await deleteMessage(messageId, userId, { isAdmin });
      const viewerUserIds = await getPermittedChannelViewerUserIds(dbMessage.channelId);

      if (deleteResult.status === "removed") {
        emitToUserRooms(io, viewerUserIds, "message:removed", {
          messageId,
          channelId: dbMessage.channelId,
        });
      } else {
        emitToUserRooms(io, viewerUserIds, "message:deleted", {
          messageId,
          channelId: dbMessage.channelId,
          deletedById: userId,
          placeholderExpiresAt: deleteResult.placeholderExpiresAt,
        });
      }

      if (dbMessage.isPinned) {
        emitToUserRooms(io, viewerUserIds, "message:pins_updated", {
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

      await requireChannelReactionPermission(userId, message.channelId);
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

      await requireChannelReactionPermission(userId, message.channelId);
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
