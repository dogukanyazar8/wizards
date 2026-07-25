import { prisma } from "@wizards/db";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import {
  loadNotificationActor,
  loadNotificationServerName,
} from "@/lib/notifications/socket-context";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";
import { filterUserIdsByChannelPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import { emitServerUnreadUpdateToUser } from "@/lib/workspace/unread-service";

export function extractMentionUsernames(content: string) {
  const mentions = new Set<string>();
  const reservedMentions = new Set(["everyone", "here"]);
  const mentionPattern = /(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/g;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    const username = (match[2] ?? "").toLocaleLowerCase("en-US");
    if (!reservedMentions.has(username)) {
      mentions.add(username);
    }
  }

  return Array.from(mentions);
}

const MENTION_PREVIEW_MAX_LENGTH = 90;

/**
 * One-line summary of the message the mention came from. "Ada seni etiketledi"
 * alone never says what for, so the notification (and the push that carries the
 * same body) leads with the message itself. Mention tokens are stripped because
 * "@dogukan" is the one word the reader already knows.
 */
export function buildMentionPreview(content: string): string | null {
  const preview = content
    .replace(/(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (preview.length === 0) {
    return null;
  }

  return preview.length > MENTION_PREVIEW_MAX_LENGTH
    ? `${preview.slice(0, MENTION_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`
    : preview;
}

export async function createChannelMentionNotifications(args: {
  channelId: string;
  channelName: string;
  content: string;
  io?: AppSocketServer;
  messageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
  skipUserIds?: string[];
}) {
  const usernames = extractMentionUsernames(args.content);
  if (usernames.length === 0) {
    return;
  }

  const skipUserIds = new Set(args.skipUserIds ?? []);
  const mentionedMembers = await prisma.serverMember.findMany({
    where: {
      serverId: args.serverId,
      userId:
        skipUserIds.size > 0
          ? { not: args.senderId, notIn: [...skipUserIds] }
          : { not: args.senderId },
      user: {
        username: {
          in: usernames,
        },
      },
    },
    select: {
      joinedAt: true,
      userId: true,
      user: {
        select: {
          locale: true,
        },
      },
    },
  });

  if (mentionedMembers.length === 0) {
    return;
  }

  const visibleMentionedUserIds = new Set(
    await filterUserIdsByChannelPermission(
      args.channelId,
      mentionedMembers.map((member) => member.userId),
      PermissionBits.VIEW_CHANNEL,
    ),
  );
  const permittedMentionedMembers = mentionedMembers.filter((member) =>
    visibleMentionedUserIds.has(member.userId),
  );

  if (permittedMentionedMembers.length === 0) {
    return;
  }

  const mentionedUserIds = permittedMentionedMembers.map((member) => member.userId);
  const [channelSettings, serverSettings] = await Promise.all([
    prisma.userChannelSettings.findMany({
      where: {
        channelId: args.channelId,
        userId: { in: mentionedUserIds },
      },
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        userId: true,
      },
    }),
    prisma.userServerSettings.findMany({
      where: {
        serverId: args.serverId,
        userId: { in: mentionedUserIds },
      },
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        userId: true,
      },
    }),
  ]);
  const now = new Date();
  const channelSettingsByUserId = new Map(
    channelSettings.map((setting) => [setting.userId, setting]),
  );
  const serverSettingsByUserId = new Map(
    serverSettings.map((setting) => [setting.userId, setting]),
  );
  const isMuted = (setting: { muted: boolean; mutedUntil: Date | null } | undefined) =>
    Boolean(setting?.muted) || Boolean(setting?.mutedUntil && setting.mutedUntil > now);
  const shouldReceiveMention = (userId: string) => {
    const channelSetting = channelSettingsByUserId.get(userId);
    const serverSetting = serverSettingsByUserId.get(userId);

    if (isMuted(channelSetting) || isMuted(serverSetting)) {
      return false;
    }

    if (
      channelSetting?.messageNotifications === "NOTHING" ||
      serverSetting?.messageNotifications === "NOTHING"
    ) {
      return false;
    }

    return true;
  };
  const mentionRecipients = permittedMentionedMembers.filter((member) =>
    shouldReceiveMention(member.userId),
  );

  if (mentionRecipients.length === 0) {
    return;
  }

  const mentionPreview = buildMentionPreview(args.content);
  const notificationData = mentionRecipients.map((member) => {
    const locale = normalizeAppLocale(member.user.locale);

    return {
      actionUrl: `/channels/${args.serverId}/${args.channelId}`,
      // The row body stays the plain sentence: the feed renders the message
      // itself underneath it as a styled quote, so repeating it here would print
      // the same text twice. The push, which has no second line, gets the
      // combined form below.
      body: translate(locale, "chat.mentions.notifyBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      dedupeKey: `channel-mention:${args.messageId}:${member.userId}`,
      metadata: {
        channelId: args.channelId,
        ...(mentionPreview ? { messagePreview: mentionPreview } : {}),
        messageId: args.messageId,
        senderId: args.senderId,
        serverId: args.serverId,
      },
      pushBody: mentionPreview
        ? translate(locale, "chat.mentions.notifyBodyWithMessage", {
            channel: args.channelName,
            name: args.senderName,
            preview: mentionPreview,
          })
        : translate(locale, "chat.mentions.notifyBody", {
            channel: args.channelName,
            name: args.senderName,
          }),
      title: translate(locale, "chat.mentions.notifyTitle"),
      type: "MENTION" as const,
      userId: member.userId,
    };
  });

  const notifications = await prisma.$transaction(async (tx) => {
    const createdMentions = await tx.messageMention.createManyAndReturn({
      data: mentionRecipients.map((member) => ({
        messageId: args.messageId,
        userId: member.userId,
      })),
      skipDuplicates: true,
    });
    const createdMentionUserIds = new Set(createdMentions.map((mention) => mention.userId));
    const newMentionRecipients = mentionRecipients.filter((member) =>
      createdMentionUserIds.has(member.userId),
    );

    await Promise.all(
      newMentionRecipients.map((member) =>
        tx.channelReadState.upsert({
          where: {
            channelId_userId: {
              channelId: args.channelId,
              userId: member.userId,
            },
          },
          create: {
            channelId: args.channelId,
            lastReadAt: member.joinedAt,
            mentionCount: 1,
            userId: member.userId,
          },
          update: {
            mentionCount: {
              increment: 1,
            },
          },
        }),
      ),
    );

    return tx.notification.createManyAndReturn({
      // `pushBody` is a transport-only field, never a Notification column.
      data: notificationData.map(({ pushBody: _pushBody, ...row }) => row),
      skipDuplicates: true,
    });
  });

  // Resolved once for the whole fan-out so every recipient's event can be drawn
  // without a follow-up fetch, and only when there is a socket to emit on.
  const [actor, server] =
    args.io && notifications.length
      ? await Promise.all([
          loadNotificationActor(args.senderId),
          loadNotificationServerName(args.serverId),
        ])
      : [null, null];

  for (const notification of notifications) {
    args.io?.to(`user:${notification.userId}`).emit(
      "notification:new",
      serializeNotification(notification as NotificationRecord, {
        actor,
        channel: { id: args.channelId, name: args.channelName },
        server,
      }),
    );
    void emitServerUnreadUpdateToUser(notification.userId, args.serverId).catch(() => undefined);
  }

  // The push has a single line, so it carries the combined "who + where + what"
  // form instead of the feed's headline.
  const pushBodyByUserId = new Map(
    notificationData.map((row) => [row.userId, row.pushBody] as const),
  );
  void sendMobilePushForNotifications(
    notifications.map((notification) => ({
      actionUrl: notification.actionUrl,
      body: pushBodyByUserId.get(notification.userId) ?? notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    })),
  ).catch(() => undefined);
}

export async function createChannelThreadReplyNotification(args: {
  channelId: string;
  channelName: string;
  content: string;
  io?: AppSocketServer;
  messageId: string;
  parentMessageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
}) {
  const parent = await prisma.message.findFirst({
    where: {
      id: args.parentMessageId,
      channelId: args.channelId,
      deletedAt: null,
      userId: { not: args.senderId },
    },
    select: {
      userId: true,
      author: {
        select: {
          locale: true,
        },
      },
    },
  });

  if (!parent) {
    return;
  }

  const [visibleParentUserId] = await filterUserIdsByChannelPermission(
    args.channelId,
    [parent.userId],
    PermissionBits.VIEW_CHANNEL,
  );
  if (!visibleParentUserId) {
    return;
  }

  const locale = normalizeAppLocale(parent.author.locale);
  const notifications = await prisma.notification.createManyAndReturn({
    data: [
      {
        actionUrl: `/channels/${args.serverId}/${args.channelId}?thread=${args.parentMessageId}`,
        body: translate(locale, "chat.thread.notifyBody", {
          channel: args.channelName,
          name: args.senderName,
        }),
        dedupeKey: `channel-thread-reply:${args.messageId}:${parent.userId}`,
        metadata: {
          channelId: args.channelId,
          messageId: args.messageId,
          parentMessageId: args.parentMessageId,
          serverId: args.serverId,
          threadReplyPreview: args.content.slice(0, 180),
        },
        title: translate(locale, "chat.thread.notifyTitle"),
        type: "SYSTEM",
        userId: parent.userId,
      },
    ],
    skipDuplicates: true,
  });

  const [threadActor, threadServer] =
    args.io && notifications.length
      ? await Promise.all([
          loadNotificationActor(args.senderId),
          loadNotificationServerName(args.serverId),
        ])
      : [null, null];

  for (const notification of notifications) {
    args.io?.to(`user:${parent.userId}`).emit(
      "notification:new",
      serializeNotification(notification as NotificationRecord, {
        actor: threadActor,
        channel: { id: args.channelId, name: args.channelName },
        server: threadServer,
      }),
    );
  }

  void sendMobilePushForNotifications(
    notifications.map((notification) => ({
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    })),
  ).catch(() => undefined);
}
