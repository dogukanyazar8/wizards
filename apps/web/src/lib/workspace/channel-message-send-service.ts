import { ChannelType, prisma } from "@wizards/db";
import type { ChatMessage, UploadedAttachmentInput } from "@wizards/types";

import { ApiError } from "@/lib/api";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { logError } from "@/lib/logger";
import {
  isMessageGifContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import type { AppSocketServer } from "@/lib/socket/runtime";
import { createMessage } from "@/lib/workspace/message-service";
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

export async function sendChannelMessage(args: {
  alsoSendToChannel?: boolean;
  attachments?: UploadedAttachmentInput[];
  attribution?: ClientAttribution;
  channelId: string;
  /** Echoed back to the author so their optimistic bubble can absorb the echo. */
  clientNonce?: string | null;
  content: string;
  forwardOfMessageId?: string | null;
  io?: AppSocketServer | null;
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
  const canBypassMessageLimit = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);
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
  const message = await createMessage(
    args.channelId,
    args.userId,
    content,
    args.replyToId ?? undefined,
    attachmentInputs,
    args.threadParentId ?? undefined,
    {
      alsoSendToChannel: args.alsoSendToChannel === true,
      ...(args.attribution ? { attribution: args.attribution } : {}),
      forwardOfMessageId: args.forwardOfMessageId ?? null,
      // Enqueued by the same transaction that writes the message; the fan-out
      // below no longer decides whether anyone is told.
      notification: { channelName: channel.name, serverId: channel.serverId },
      permissions,
    },
  );

  // Only the author gets the nonce: it is the key to their optimistic bubble and
  // means nothing to anyone else's cache.
  const authorMessage = args.clientNonce ? { ...message, clientNonce: args.clientNonce } : message;

  if (args.io) {
    await emitChannelMessageFanout({
      authorMessage,
      channelId: args.channelId,
      io: args.io,
      message,
      senderId: args.userId,
      serverId: channel.serverId,
    });
  }

  return message;
}
