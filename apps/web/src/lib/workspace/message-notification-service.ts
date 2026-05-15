import { prisma } from "@wizards/db";

import { normalizeAppLocale, translate } from "@/lib/locale";
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

export async function createChannelMentionNotifications(args: {
  channelId: string;
  channelName: string;
  content: string;
  io: AppSocketServer;
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

  await prisma.messageMention.createMany({
    data: mentionRecipients.map((member) => ({
      messageId: args.messageId,
      userId: member.userId,
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    mentionRecipients.map((member) =>
      prisma.channelReadState.upsert({
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

  const notifications = await prisma.notification.createManyAndReturn({
    data: mentionRecipients.map((member) => {
      const locale = normalizeAppLocale(member.user.locale);

      return {
        actionUrl: `/channels/${args.serverId}/${args.channelId}`,
        body: translate(locale, "chat.mentions.notifyBody", {
          channel: args.channelName,
          name: args.senderName,
        }),
        metadata: {
          channelId: args.channelId,
          messageId: args.messageId,
          senderId: args.senderId,
          serverId: args.serverId,
        },
        title: translate(locale, "chat.mentions.notifyTitle"),
        type: "MENTION" as const,
        userId: member.userId,
      };
    }),
  });

  for (const notification of notifications) {
    args.io
      .to(`user:${notification.userId}`)
      .emit("notification:new", serializeNotification(notification as NotificationRecord));
    void emitServerUnreadUpdateToUser(notification.userId, args.serverId).catch(() => undefined);
  }
}

export async function createChannelThreadReplyNotification(args: {
  channelId: string;
  channelName: string;
  content: string;
  io: AppSocketServer;
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
  const notification = await prisma.notification.create({
    data: {
      actionUrl: `/channels/${args.serverId}/${args.channelId}?thread=${args.parentMessageId}`,
      body: translate(locale, "chat.thread.notifyBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      metadata: {
        channelId: args.channelId,
        parentMessageId: args.parentMessageId,
        serverId: args.serverId,
        threadReplyPreview: args.content.slice(0, 180),
      },
      title: translate(locale, "chat.thread.notifyTitle"),
      type: "SYSTEM",
      userId: parent.userId,
    },
  });

  args.io
    .to(`user:${parent.userId}`)
    .emit("notification:new", serializeNotification(notification as NotificationRecord));
}
