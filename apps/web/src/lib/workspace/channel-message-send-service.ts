import { ChannelType, prisma } from "@wizards/db";
import type Redis from "ioredis";
import type { ChatMessage, UploadedAttachmentInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import {
  isMessageGifContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import { deferMessageFanout } from "@/lib/messages/deferred-fanout";
import type { checkChannelSlowMode } from "@/lib/socket/rate-limits";
import type { AppSocketServer } from "@/lib/socket/runtime";
import { checkEffectiveChannelSlowMode } from "@/lib/workspace/channel-slow-mode";
import { assertMemberNotTimedOut } from "@/lib/workspace/member-timeout";
import {
  createMessageWithClientNonce,
  type ChannelMessagePollInput,
} from "@/lib/workspace/message-service";
import { toMobileChannelMessagePreview } from "@/lib/workspace/mobile-channel-message-preview";
import {
  PRIVILEGED_PERMISSION_CACHE_MAX_AGE_SECONDS,
  filterUserIdsByChannelPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { recordMessageSendFanoutMetric } from "@/lib/workspace/performance-metrics";
import { hasPermission, PermissionBits } from "@/lib/workspace/permissions";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  getActiveServerMemberUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";

function deriveChannelMessageFanoutTargets(args: {
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

async function assertChannelAttachmentsAllowed(args: {
  attachments: UploadedAttachmentInput[];
  permissions: bigint;
  serverFeatures: string[];
  userId: string;
}) {
  if (args.attachments.length === 0) {
    return;
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      id: { in: args.attachments.map((attachment) => attachment.id) },
      userId: args.userId,
    },
    select: {
      contentType: true,
    },
  });
  const mediaSettings = getServerMediaSettings(args.serverFeatures);

  if (
    !mediaSettings.allowGifs &&
    attachments.some((attachment) => isMessageGifContentType(attachment.contentType))
  ) {
    throw new ApiError("GIFs are disabled for this server.", 403, "GIFS_DISABLED");
  }

  if (
    !hasPermission(args.permissions, PermissionBits.USE_GIFS) &&
    attachments.some((attachment) => isMessageGifContentType(attachment.contentType))
  ) {
    throw new ApiError("You cannot send GIFs in this channel.", 403, "GIFS_FORBIDDEN");
  }

  if (
    !mediaSettings.allowFileUploads &&
    attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))
  ) {
    throw new ApiError("File uploads are disabled for this server.", 403, "FILE_UPLOADS_DISABLED");
  }

  if (
    !hasPermission(args.permissions, PermissionBits.ATTACH_FILES) &&
    attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))
  ) {
    throw new ApiError("You cannot attach files in this channel.", 403, "ATTACHMENTS_FORBIDDEN");
  }
}

async function emitChannelMessageFanout(args: {
  /** The author's copy, which alone carries their `clientNonce`. */
  authorMessage?: ChatMessage;
  channelId: string;
  io: AppSocketServer;
  message: ChatMessage;
  senderId: string;
  serverId: string;
}) {
  const messageCreatedAt = new Date(args.message.createdAt);
  const fanoutStartedAt = Date.now();
  const presenceLookupStartedAt = Date.now();
  const [activeChannelViewerCandidateUserIds, activeServerMemberUserIds] = await Promise.all([
    getActiveChannelViewerUserIds(args.channelId),
    getActiveServerMemberUserIds(args.serverId),
  ]);
  const presenceLookupDurationMs = Date.now() - presenceLookupStartedAt;
  const permissionFilterStartedAt = Date.now();
  const permittedActiveUserIds = await filterUserIdsByChannelPermission(
    args.channelId,
    [...activeChannelViewerCandidateUserIds, ...activeServerMemberUserIds],
    PermissionBits.VIEW_CHANNEL,
  );
  const permissionFilterDurationMs = Date.now() - permissionFilterStartedAt;
  const { activeChannelViewerUserIds, permittedUnreadUserIds, readUserIds, unreadUpdateUserIds } =
    deriveChannelMessageFanoutTargets({
      activeChannelViewerCandidateUserIds,
      activeServerMemberUserIds,
      permittedActiveUserIds,
      senderId: args.senderId,
    });

  const directEmitStartedAt = Date.now();
  if (unreadUpdateUserIds.length > 0) {
    args.io
      .to(unreadUpdateUserIds.map((memberUserId) => `user:${memberUserId}`))
      .emit("channel:messages:stale", {
        channelId: args.channelId,
        lastMessage: toMobileChannelMessagePreview(args.message),
        latestMessageId: args.message.id,
        serverId: args.serverId,
      });
  }

  if (activeChannelViewerUserIds.length > 0) {
    const senderViewerIds = activeChannelViewerUserIds.filter(
      (viewerUserId) => viewerUserId === args.senderId,
    );
    const otherViewerIds = activeChannelViewerUserIds.filter(
      (viewerUserId) => viewerUserId !== args.senderId,
    );

    if (senderViewerIds.length > 0) {
      args.io
        .to(senderViewerIds.map((viewerUserId) => `user:${viewerUserId}`))
        .emit("message:new", args.authorMessage ?? args.message);
    }

    if (otherViewerIds.length > 0) {
      args.io
        .to(otherViewerIds.map((viewerUserId) => `user:${viewerUserId}`))
        .emit("message:new", redactMessageAttachmentUrlsForViewer(args.message, null));
    }
  }
  const directEmitDurationMs = Date.now() - directEmitStartedAt;

  void (async () => {
    await markChannelReadStates({
      channelId: args.channelId,
      lastReadAt: messageCreatedAt,
      lastReadMessageId: args.message.id,
      userIds: readUserIds,
    });
    await emitServerUnreadUpdatesForServer(args.serverId, unreadUpdateUserIds);
  })().catch((error) => {
    logError("[mobile-api] Channel message unread state update failed", error);
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

  return { readUserIds };
}

/**
 * Ş1 §2 — yavaş modun REST yolundaki kapısı.
 *
 * Bu yol bugüne kadar yavaş modu **hiç** uygulamıyordu: kural yalnızca soket
 * `message:send` işleyicisindeydi, dolayısıyla aynı hesap mobil uçtan sınırsız
 * gönderebiliyordu. Etkin süre `max(server, channel)` (SPEC-SUNUCU §8.3) ve iki
 * yol da `checkEffectiveChannelSlowMode`'dan geçiyor.
 *
 * Hata kodu ve metni soket yolundakinin aynısı; yeni kod üretilmedi.
 */
export async function assertChannelSlowModeAllowsSend(args: {
  channelDelaySeconds: number;
  channelId: string;
  checkSlowMode?: typeof checkChannelSlowMode;
  permissions: bigint;
  /** Test seam; production reads the shared rate-limit connection. */
  redis?: Redis;
  serverDelaySeconds: number;
  userId: string;
}) {
  const result = await checkEffectiveChannelSlowMode({
    channelDelaySeconds: args.channelDelaySeconds,
    channelId: args.channelId,
    ...(args.checkSlowMode ? { check: args.checkSlowMode } : {}),
    permissions: args.permissions,
    redis: args.redis ?? getRedisRate(),
    serverDelaySeconds: args.serverDelaySeconds,
    userId: args.userId,
  });

  if (result.status === "limited") {
    throw new ApiError(
      "Slow mode is active. Please wait before sending another message.",
      429,
      "SLOW_MODE",
    );
  }

  // Fails closed, exactly like the socket path: an unreadable slow-mode key is
  // not permission to ignore the setting.
  if (result.status === "unavailable") {
    logError("[mobile-api] Channel slow mode unavailable; blocking message send", result.error);
    throw new ApiError(
      "Message controls are temporarily unavailable. Please try again shortly.",
      503,
      "RATE_LIMIT_UNAVAILABLE",
    );
  }
}

export async function sendChannelMessage(args: {
  alsoSendToChannel?: boolean;
  attachments?: UploadedAttachmentInput[];
  attribution?: ClientAttribution;
  channelId: string;
  /** Test seam for the Redis-backed slow-mode window; production uses the real check. */
  checkSlowMode?: typeof checkChannelSlowMode;
  /** Echoed back to the author so their optimistic bubble can absorb the echo. */
  clientNonce?: string | null;
  content: string;
  forwardOfMessageId?: string | null;
  io?: AppSocketServer | null;
  poll?: ChannelMessagePollInput | null;
  replyToId?: string | null;
  threadParentId?: string | null;
  userId: string;
}): Promise<ChatMessage> {
  const { channel, permissions } = await requireChannelPermissionForUser(
    args.userId,
    args.channelId,
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
  // Zaman aşımı kanal yetkisinin değil üyeliğin bir durumu, ve süresi geçtiğinde kendiliğinden
  // biter — bu yüzden `requireChannelPermissionForUser`ın önbelleğine giremez, her gönderimde
  // taze okunur (Ş2 §4).
  await assertMemberNotTimedOut(channel.serverId, args.userId);
  const canBypassMessageLimit = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

  await assertChannelSlowModeAllowsSend({
    channelDelaySeconds: channel.slowModeDelay,
    channelId: args.channelId,
    ...(args.checkSlowMode ? { checkSlowMode: args.checkSlowMode } : {}),
    permissions,
    serverDelaySeconds: channel.server.slowModeDelay,
    userId: args.userId,
  });

  const attachmentInputs = parseUploadedAttachmentInputs(args.attachments ?? []);

  await assertChannelAttachmentsAllowed({
    attachments: attachmentInputs,
    permissions,
    serverFeatures: channel.server.features,
    userId: args.userId,
  });

  const content = normalizeMessageContentForSend(
    args.content,
    attachmentInputs,
    canBypassMessageLimit ? null : channel.server.messageCharacterLimit,
  );
  const { deduplicated, message } = await createMessageWithClientNonce(
    args.channelId,
    args.userId,
    content,
    args.replyToId ?? undefined,
    attachmentInputs,
    args.threadParentId ?? undefined,
    {
      alsoSendToChannel: args.alsoSendToChannel === true,
      ...(args.attribution ? { attribution: args.attribution } : {}),
      clientNonce: args.clientNonce ?? null,
      forwardOfMessageId: args.forwardOfMessageId ?? null,
      // Enqueued by the same transaction that writes the message; the fan-out
      // below no longer decides whether anyone is told.
      notification: { channelName: channel.name, serverId: channel.serverId },
      poll: args.poll ?? null,
      permissions,
    },
  );

  // Only the author gets the nonce: it is the key to their optimistic bubble and
  // means nothing to anyone else's cache.
  const authorMessage = args.clientNonce ? { ...message, clientNonce: args.clientNonce } : message;

  // A retry is answered, never re-announced: the first attempt already emitted
  // this message and moved everyone's unread state. Repeating the fan-out would
  // show one send arriving twice.
  if (args.io && !deduplicated) {
    const io = args.io;
    // Not awaited. The message is durable and its notification job is already
    // committed; everything below is other people's screens, and the sender's
    // tick used to wait on two presence lookups and a permission filter across
    // every active member before it could turn.
    void deferMessageFanout("[mobile-api] Channel message fan-out failed", () =>
      emitChannelMessageFanout({
        authorMessage,
        channelId: args.channelId,
        io,
        message,
        senderId: args.userId,
        serverId: channel.serverId,
      }),
    );
  }

  return message;
}
