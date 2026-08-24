import { prisma } from "@wizards/db";
import type { MentionQuietHours } from "@wizards/types";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import {
  loadNotificationActor,
  loadNotificationServerName,
} from "@/lib/notifications/socket-context";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";
import { extractMentionUsernames } from "@/lib/workspace/mention-parser";
import { filterUserIdsByChannelPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  ensureImplicitFollow,
  listMutedThreadFollowerIds,
  listThreadFollowers,
} from "@/lib/workspace/thread-follow-service";
import { emitServerUnreadUpdateToUser } from "@/lib/workspace/unread-service";

/**
 * Bahsedilmeler Ş2: gövde `mention-parser`a taşındı, davranışı değişmedi. Bu satır eski içe
 * aktarma yolunu ayakta tutuyor — çağıranlar ve mevcut testler bu modülden okuyor (tuzak #3).
 */
export { extractMentionUsernames };

const MENTION_PREVIEW_MAX_LENGTH = 90;

/**
 * Rol ve `@herkes` fan-out'ları tek `createMany` ile yazılmaz: 2.000 üyeli bir rol tek deyimde
 * 2.000 satır demektir ve o deyim boyunca kilit tutulur (tuzak #9).
 */
export const CHANNEL_FANOUT_BATCH_SIZE = 500;

export function chunkForFanOut<T>(items: readonly T[], size = CHANNEL_FANOUT_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

export type MentionNotificationSettingsRow = {
  mentionSelf: boolean;
  mentionThreadReplies: boolean;
  /** Ş4 `isWithinQuietHours` sözleşmesinin beklediği taşıyıcı. */
  quietHours: MentionQuietHours;
  suppressEveryoneMentions: boolean;
  suppressRoleMentions: boolean;
};

const MENTION_NOTIFICATION_SETTINGS_DEFAULTS: MentionNotificationSettingsRow = {
  mentionSelf: true,
  mentionThreadReplies: false,
  quietHours: { enabled: false, from: null, to: null, timeZone: null },
  suppressEveryoneMentions: false,
  suppressRoleMentions: false,
};

/**
 * Satırı olmayan kullanıcı **varsayılanları** taşır. `mentionThreadReplies` varsayılanı kapalı
 * (K6): bu şerit yayına girdiğinde ayarına hiç dokunmamış hiç kimse thread yanıtı bildirimi
 * almamalı.
 *
 * `suppress*` ters mantığı yalnız burada, servis katmanında çözülür (Dalga 0 notu #4).
 */
export async function readMentionNotificationSettings(
  userIds: readonly string[],
): Promise<Map<string, MentionNotificationSettingsRow>> {
  const settings = new Map<string, MentionNotificationSettingsRow>();
  if (userIds.length === 0) {
    return settings;
  }

  const rows = await prisma.userNotificationSettings.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: {
      mentionSelf: true,
      mentionThreadReplies: true,
      quietHoursEnabled: true,
      quietHoursFrom: true,
      quietHoursTimeZone: true,
      quietHoursTo: true,
      suppressEveryoneMentions: true,
      suppressRoleMentions: true,
      userId: true,
    },
  });

  for (const row of rows) {
    settings.set(row.userId, {
      mentionSelf: row.mentionSelf,
      mentionThreadReplies: row.mentionThreadReplies,
      quietHours: {
        enabled: row.quietHoursEnabled,
        from: row.quietHoursFrom,
        to: row.quietHoursTo,
        timeZone: row.quietHoursTimeZone,
      },
      suppressEveryoneMentions: row.suppressEveryoneMentions,
      suppressRoleMentions: row.suppressRoleMentions,
    });
  }

  return settings;
}

export function readMentionSetting(
  settings: Map<string, MentionNotificationSettingsRow>,
  userId: string,
): MentionNotificationSettingsRow {
  return settings.get(userId) ?? MENTION_NOTIFICATION_SETTINGS_DEFAULTS;
}

/** Şu an sessiz saatte olan alıcılar. Bildirimi alırlar, push'u almazlar. */
export function collectQuietUserIds(
  settings: Map<string, MentionNotificationSettingsRow>,
  userIds: readonly string[],
  now = new Date(),
): Set<string> {
  const quiet = new Set<string>();
  for (const userId of userIds) {
    if (isWithinQuietHours(readMentionSetting(settings, userId), now)) {
      quiet.add(userId);
    }
  }

  return quiet;
}

/**
 * Kanal ve sunucu sessize alma süzgeci. Üç fan-out'un (kendi adına, rol, `@herkes`) hepsi aynı
 * kuralı uygular; ayrı kopyalar ilk ayarlama farkında ayrışırdı.
 */
export async function createChannelMuteFilter(args: {
  channelId: string;
  now?: Date;
  serverId: string;
  userIds: readonly string[];
}): Promise<(userId: string) => boolean> {
  const userIds = [...new Set(args.userIds)];
  if (userIds.length === 0) {
    return () => false;
  }

  const [channelSettings, serverSettings] = await Promise.all([
    prisma.userChannelSettings.findMany({
      where: { channelId: args.channelId, userId: { in: userIds } },
      select: { messageNotifications: true, muted: true, mutedUntil: true, userId: true },
    }),
    prisma.userServerSettings.findMany({
      where: { serverId: args.serverId, userId: { in: userIds } },
      select: { messageNotifications: true, muted: true, mutedUntil: true, userId: true },
    }),
  ]);
  const now = args.now ?? new Date();
  const channelSettingsByUserId = new Map(
    channelSettings.map((setting) => [setting.userId, setting]),
  );
  const serverSettingsByUserId = new Map(
    serverSettings.map((setting) => [setting.userId, setting]),
  );
  const isMuted = (setting: { muted: boolean; mutedUntil: Date | null } | undefined) =>
    Boolean(setting?.muted) || Boolean(setting?.mutedUntil && setting.mutedUntil > now);

  return (userId: string) => {
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
}

/**
 * Yazılan bildirim satırlarını sokete ve push'a taşır. Sessiz saatte olan alıcı satırını yine
 * alır, yalnız push'u almaz.
 */
export async function deliverChannelNotifications(args: {
  channelId: string;
  channelName: string;
  emitServerUnread?: boolean;
  io?: AppSocketServer;
  notifications: NotificationRecord[];
  pushBodyByUserId?: Map<string, string>;
  /**
   * Ş4 sözleşmesi: sessiz saat **yalnız** push'u bastırır. Satır, sayaç ve socket olayı yerinde
   * kalır — tasarımın kendi metni "bahsetmeler sayaçta birikir" diyor. Küme verilmezse kimse
   * sessiz saatte değildir (`@herkes` gibi ayarları zaten okumuş dallar kümeyi geçirir).
   */
  quietUserIds?: ReadonlySet<string>;
  senderId: string;
  serverId: string;
}) {
  if (args.notifications.length === 0) {
    return;
  }

  const [actor, server] = args.io
    ? await Promise.all([
        loadNotificationActor(args.senderId),
        loadNotificationServerName(args.serverId),
      ])
    : [null, null];

  for (const notification of args.notifications) {
    args.io?.to(`user:${notification.userId}`).emit(
      "notification:new",
      serializeNotification(notification, {
        actor,
        channel: { id: args.channelId, name: args.channelName },
        server,
      }),
    );
    if (args.emitServerUnread) {
      void emitServerUnreadUpdateToUser(notification.userId, args.serverId).catch(() => undefined);
    }
  }

  void sendMobilePushForNotifications(
    args.notifications
      .filter((notification) => !args.quietUserIds?.has(notification.userId))
      .map((notification) => ({
        actionUrl: notification.actionUrl,
        body: args.pushBodyByUserId?.get(notification.userId) ?? notification.body,
        id: notification.id,
        title: notification.title,
        type: notification.type,
        userId: notification.userId,
      })),
  ).catch(() => undefined);
}

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
  const [shouldReceiveMention, settings] = await Promise.all([
    createChannelMuteFilter({
      channelId: args.channelId,
      serverId: args.serverId,
      userIds: mentionedUserIds,
    }),
    readMentionNotificationSettings(mentionedUserIds),
  ]);
  const mentionRecipients = permittedMentionedMembers.filter(
    (member) =>
      shouldReceiveMention(member.userId) &&
      readMentionSetting(settings, member.userId).mentionSelf,
  );

  if (mentionRecipients.length === 0) {
    return;
  }

  const mentionPreview = buildMentionPreview(args.content);
  const notificationData = mentionRecipients.map((member) => {
    const locale = normalizeAppLocale(member.user.locale);

    return {
      notification: {
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
        title: translate(locale, "chat.mentions.notifyTitle"),
        type: "MENTION" as const,
        userId: member.userId,
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
    };
  });

  const notifications = await prisma.$transaction(async (tx) => {
    const createdMentions = await tx.messageMention.createManyAndReturn({
      // Bahsedilmeler Ş2: bu dal kullanıcı adı eşleşmesidir, yani her zaman `SELF`. Rol dalı
      // `role-mention-service` içinde ayrıca yazılır ve aynı kullanıcı için ikinci satırı
      // `@@unique([messageId, userId])` düşürür — kazanan `SELF` olur.
      data: mentionRecipients.map((member) => ({
        kind: "SELF" as const,
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
      data: notificationData.map((row) => row.notification),
      skipDuplicates: true,
    });
  });

  // The push has a single line, so it carries the combined "who + where + what"
  // form instead of the feed's headline.
  const pushBodyByUserId = new Map(
    notificationData.map((row) => [row.notification.userId, row.pushBody] as const),
  );
  await deliverChannelNotifications({
    channelId: args.channelId,
    channelName: args.channelName,
    emitServerUnread: true,
    ...(args.io ? { io: args.io } : {}),
    notifications: notifications as NotificationRecord[],
    pushBodyByUserId,
    quietUserIds: collectQuietUserIds(settings, mentionedUserIds),
    senderId: args.senderId,
    serverId: args.serverId,
  });
}

/**
 * Bahsedilmeler Ş2 / karar K2 — `@herkes` ve `@burada`.
 *
 * **Satır yazılmaz.** `Message.mentionEveryone` bayrağı gönderimde ve düzenlemede zaten
 * yazılıyor ve geçmiş veri dahil dolu; akış kartını Ş3 o bayraktan türetir. Üye başına
 * `MessageMention` satırı 5.000 üyeli bir sunucuda gönderim başına 5.000 yazma demekti.
 * Burada yalnız bildirim üretilir, `dedupeKey` öneki `channel-everyone:` — `channel-mention:`
 * öneki kullanılsaydı Ş3'ün okuma sorgusu iki dalı birbirinden ayıramazdı.
 */
export async function createChannelEveryoneNotifications(args: {
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
  const skipUserIds = new Set([...(args.skipUserIds ?? []), args.senderId]);
  const members = await prisma.serverMember.findMany({
    where: { serverId: args.serverId, userId: { notIn: [...skipUserIds] } },
    select: { userId: true, user: { select: { locale: true } } },
  });

  if (members.length === 0) {
    return;
  }

  const visibleUserIds = new Set(
    await filterUserIdsByChannelPermission(
      args.channelId,
      members.map((member) => member.userId),
      PermissionBits.VIEW_CHANNEL,
    ),
  );
  const visibleMembers = members.filter((member) => visibleUserIds.has(member.userId));
  if (visibleMembers.length === 0) {
    return;
  }

  const visibleMemberIds = visibleMembers.map((member) => member.userId);
  const [isNotMuted, settings] = await Promise.all([
    createChannelMuteFilter({
      channelId: args.channelId,
      serverId: args.serverId,
      userIds: visibleMemberIds,
    }),
    readMentionNotificationSettings(visibleMemberIds),
  ]);
  const recipients = visibleMembers.filter(
    (member) =>
      isNotMuted(member.userId) &&
      !readMentionSetting(settings, member.userId).suppressEveryoneMentions,
  );

  if (recipients.length === 0) {
    return;
  }

  const preview = buildMentionPreview(args.content);
  const pushBodyByUserId = new Map<string, string>();
  const notificationData = recipients.map((member) => {
    const locale = normalizeAppLocale(member.user.locale);
    pushBodyByUserId.set(
      member.userId,
      preview
        ? translate(locale, "chat.mentions.notifyEveryoneBodyWithMessage", {
            channel: args.channelName,
            name: args.senderName,
            preview,
          })
        : translate(locale, "chat.mentions.notifyEveryoneBody", {
            channel: args.channelName,
            name: args.senderName,
          }),
    );

    return {
      actionUrl: `/channels/${args.serverId}/${args.channelId}`,
      body: translate(locale, "chat.mentions.notifyEveryoneBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      dedupeKey: `channel-everyone:${args.messageId}:${member.userId}`,
      metadata: {
        channelId: args.channelId,
        mentionEveryone: true,
        ...(preview ? { messagePreview: preview } : {}),
        messageId: args.messageId,
        senderId: args.senderId,
        serverId: args.serverId,
      },
      title: translate(locale, "chat.mentions.notifyEveryoneTitle"),
      type: "MENTION" as const,
      userId: member.userId,
    };
  });

  const notifications: NotificationRecord[] = [];
  for (const batch of chunkForFanOut(notificationData)) {
    const created = await prisma.notification.createManyAndReturn({
      data: batch,
      skipDuplicates: true,
    });
    notifications.push(...(created as NotificationRecord[]));
  }

  await deliverChannelNotifications({
    channelId: args.channelId,
    channelName: args.channelName,
    ...(args.io ? { io: args.io } : {}),
    notifications,
    pushBodyByUserId,
    quietUserIds: collectQuietUserIds(settings, visibleMemberIds),
    senderId: args.senderId,
    serverId: args.serverId,
  });
}

/**
 * Bahsedilmeler Ş2 / karar K3 — thread yanıtı bildirimi.
 *
 * Bugüne kadar yalnız **üst mesajın yazarı** bildirim alıyordu. Alıcı kümesi artık takipçiler,
 * ama üst mesaj yazarının bugünkü bildirimi **kaybedilmiyor**: `mentionThreadReplies` varsayılanı
 * kapalı (K6) olduğu için yazarı bu anahtara bağlamak, şerit yayına girdiği gün onu susturmak
 * olurdu. Bu yüzden iki ayrı kural var:
 *
 * - Üst mesaj yazarı: bugünkü koşullarla bildirim alır; **yalnız** thread'i bilerek kapattıysa
 *   (`ThreadFollow.mutedAt` dolu) almaz.
 * - Diğer takipçiler: `mentionThreadReplies` açık olmalı, kanal/sunucu sessize alınmamış olmalı
 *   ve bu yanıtta zaten adıyla bahsedilmemiş olmalı (aksi halde aynı yanıt için iki bildirim).
 */
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
    },
    select: { userId: true },
  });

  if (!parent) {
    return;
  }

  // Thread içinde bahsedilenler örtük takipçi olur (K3). Bu yanıt için bildirimlerini zaten
  // `createChannelMentionNotifications` üretiyor; buradaki kayıt **sonraki** yanıtlar için.
  const mentionedUsernames = extractMentionUsernames(args.content);
  const mentionedMembers =
    mentionedUsernames.length > 0
      ? await prisma.serverMember.findMany({
          where: {
            serverId: args.serverId,
            userId: { not: args.senderId },
            user: { username: { in: mentionedUsernames } },
          },
          select: { userId: true },
        })
      : [];
  const mentionedUserIds = new Set(mentionedMembers.map((member) => member.userId));
  for (const userId of mentionedUserIds) {
    await ensureImplicitFollow({
      channelId: args.channelId,
      origin: "MENTION",
      parentMessageId: args.parentMessageId,
      userId,
    });
  }

  const followers = await listThreadFollowers(args.parentMessageId);
  const followerUserIds = new Set(followers.map((follower) => follower.userId));
  const mutedFollowerIds = new Set(await listMutedThreadFollowerIds(args.parentMessageId));

  const parentAuthorId = parent.userId === args.senderId ? null : parent.userId;
  const candidateUserIds = [
    ...new Set([...(parentAuthorId ? [parentAuthorId] : []), ...followerUserIds]),
  ].filter((userId) => userId !== args.senderId);

  if (candidateUserIds.length === 0) {
    return;
  }

  const visibleUserIds = new Set(
    await filterUserIdsByChannelPermission(
      args.channelId,
      candidateUserIds,
      PermissionBits.VIEW_CHANNEL,
    ),
  );
  const permittedUserIds = candidateUserIds.filter((userId) => visibleUserIds.has(userId));
  if (permittedUserIds.length === 0) {
    return;
  }

  const [isNotMuted, settings, users] = await Promise.all([
    createChannelMuteFilter({
      channelId: args.channelId,
      serverId: args.serverId,
      userIds: permittedUserIds,
    }),
    readMentionNotificationSettings(permittedUserIds),
    prisma.user.findMany({
      where: { id: { in: permittedUserIds } },
      select: { id: true, locale: true },
    }),
  ]);
  const localeByUserId = new Map(users.map((user) => [user.id, user.locale]));
  const recipientUserIds = permittedUserIds.filter((userId) => {
    if (mutedFollowerIds.has(userId)) {
      return false;
    }

    if (userId === parentAuthorId) {
      return true;
    }

    return (
      readMentionSetting(settings, userId).mentionThreadReplies &&
      isNotMuted(userId) &&
      !mentionedUserIds.has(userId)
    );
  });

  if (recipientUserIds.length === 0) {
    return;
  }

  const notificationData = recipientUserIds.map((userId) => {
    const locale = normalizeAppLocale(localeByUserId.get(userId) ?? null);

    return {
      actionUrl: `/channels/${args.serverId}/${args.channelId}?thread=${args.parentMessageId}`,
      body: translate(locale, "chat.thread.notifyBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      dedupeKey: `channel-thread-reply:${args.messageId}:${userId}`,
      metadata: {
        channelId: args.channelId,
        messageId: args.messageId,
        parentMessageId: args.parentMessageId,
        serverId: args.serverId,
        threadReplyPreview: args.content.slice(0, 180),
      },
      title: translate(locale, "chat.thread.notifyTitle"),
      // Tip `SYSTEM` kalıyor: mobil yönlendirme bugün `SYSTEM` metadata'sına bakıyor ve ayrım
      // `metadata.parentMessageId` ile yapılıyor. `MENTION`a çevirmek mobil yönlendirmeyi kırardı.
      type: "SYSTEM" as const,
      userId,
    };
  });

  const notifications: NotificationRecord[] = [];
  for (const batch of chunkForFanOut(notificationData)) {
    const created = await prisma.notification.createManyAndReturn({
      data: batch,
      skipDuplicates: true,
    });
    notifications.push(...(created as NotificationRecord[]));
  }

  await deliverChannelNotifications({
    channelId: args.channelId,
    channelName: args.channelName,
    ...(args.io ? { io: args.io } : {}),
    notifications,
    quietUserIds: collectQuietUserIds(settings, permittedUserIds),
    senderId: args.senderId,
    serverId: args.serverId,
  });
}
