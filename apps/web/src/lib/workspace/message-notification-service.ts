import { prisma } from "@wizards/db";
import type { NotificationPrefs } from "@wizards/types";

import { normalizeAppLocale, translate, type AppLocale } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import {
  MASKED_NOTIFICATION_KEYS,
  resolveNotificationDelivery,
  type NotificationDelivery,
  type NotificationKindKey,
} from "@/lib/notifications/prefs-policy";
import {
  NOTIFICATION_PREFS_SELECT,
  readPrefs,
  toNotificationPrefs,
  type NotificationPrefsRow,
} from "@/lib/notifications/prefs-service";
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

/**
 * Ayarlar Ş1 §5 — **the** point where a stored preference becomes a delivered (or undelivered)
 * notification. Before this lane the fan-out read five mention columns and consulted quiet hours
 * by hand; it now reads the whole preference object and asks `prefs-policy` once per recipient.
 *
 * The row is still read through `userNotificationSettings.findMany` rather than through
 * `listNotificationPrefs`: this is the send path, and a per-recipient join onto `User` for the
 * account time zone would double the query on the hottest write in the product. The zone stored
 * on the notification row is used, which is what the previous code did too.
 */
export async function readMentionNotificationSettings(
  userIds: readonly string[],
): Promise<Map<string, NotificationPrefs>> {
  const settings = new Map<string, NotificationPrefs>();
  if (userIds.length === 0) {
    return settings;
  }

  const rows = await prisma.userNotificationSettings.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: { ...NOTIFICATION_PREFS_SELECT, userId: true },
  });

  for (const row of rows) {
    settings.set(row.userId, toNotificationPrefs(row as unknown as NotificationPrefsRow, null));
  }

  return settings;
}

/** Satırı olmayan kullanıcı **varsayılanları** taşır. */
export function readMentionSetting(
  settings: Map<string, NotificationPrefs>,
  userId: string,
): NotificationPrefs {
  return readPrefs(settings, userId);
}

/**
 * §5 — the gate table, one entry per recipient, resolved at one instant.
 *
 * `level = OFF` lands here and nowhere earlier: the `Notification` row is written before this is
 * consulted, so the notification centre keeps its record and only the push, the toast and the
 * system notification go quiet. That is the promise the 560 px window prints on the `Kapalı`
 * card, and it is the reason this is a delivery filter rather than a recipient filter.
 */
export function collectNotificationDelivery(
  settings: Map<string, NotificationPrefs>,
  userIds: readonly string[],
  kind: NotificationKindKey,
  now = new Date(),
): Map<string, NotificationDelivery> {
  const delivery = new Map<string, NotificationDelivery>();
  for (const userId of new Set(userIds)) {
    delivery.set(
      userId,
      resolveNotificationDelivery(readMentionSetting(settings, userId), kind, now),
    );
  }

  return delivery;
}

/**
 * §5 last row — `systemPreview = false` hides the sender and the message from the notification
 * the operating system draws. On a phone the push **is** that notification, so the masking has to
 * happen before the payload leaves this process; the in-app card keeps its own switch
 * (`panel.showContent`) and is untouched (tuzak #4).
 */
export function maskPushText(
  locale: AppLocale,
  delivery: NotificationDelivery | undefined,
  text: { body: string; title: string },
): { body: string; title: string } {
  if (delivery && !delivery.systemPreview) {
    return {
      body: translate(locale, MASKED_NOTIFICATION_KEYS.body),
      title: translate(locale, MASKED_NOTIFICATION_KEYS.title),
    };
  }

  return text;
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
  /**
   * Ayarlar Ş1 §5. One entry per recipient, from `collectNotificationDelivery`. Absent means
   * "no preference was read", which is deliberately the permissive answer: the branches that
   * have not been migrated yet keep behaving exactly as they did.
   */
  deliveryByUserId?: ReadonlyMap<string, NotificationDelivery>;
  emitServerUnread?: boolean;
  io?: AppSocketServer;
  notifications: NotificationRecord[];
  pushBodyByUserId?: Map<string, string>;
  pushTitleByUserId?: Map<string, string>;
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
    const delivery = args.deliveryByUserId?.get(notification.userId);

    // `na1` — the in-app card. The socket event is what draws it, so the switch has to be here
    // rather than in the component: an event the client throws away is still a wake-up.
    if (!delivery || delivery.inAppToast) {
      args.io?.to(`user:${notification.userId}`).emit(
        "notification:new",
        serializeNotification(notification, {
          actor,
          channel: { id: args.channelId, name: args.channelName },
          server,
        }),
      );
    }

    // The unread badge counts rows, not deliveries, so a refused notification still moves it —
    // as long as the reader asked for a counter at all (`na3`).
    if (args.emitServerUnread && (!delivery || delivery.appBadge)) {
      void emitServerUnreadUpdateToUser(notification.userId, args.serverId).catch(() => undefined);
    }
  }

  // K12 — the push gate runs **before** `sendMobilePushForNotifications`, so a recipient with
  // `delivery.push = false` costs zero token lookups rather than being filtered after the read.
  const pushable = args.notifications.filter((notification) => {
    const delivery = args.deliveryByUserId?.get(notification.userId);
    return !delivery || delivery.push;
  });

  if (pushable.length === 0) {
    return;
  }

  void sendMobilePushForNotifications(
    pushable.map((notification) => ({
      actionUrl: notification.actionUrl,
      body: args.pushBodyByUserId?.get(notification.userId) ?? notification.body,
      id: notification.id,
      title: args.pushTitleByUserId?.get(notification.userId) ?? notification.title,
      type: notification.type,
      userId: notification.userId,
    })),
    {
      // Ş13 — gönderici artık kapıyı kendi içinde uyguluyor (borç B1). Bu yol tercihleri
      // **zaten** okumuş durumda (deliveryByUserId) ve yukarıdaki süzgeç onu uyguladı;
      // ikinci bir okuma aynı satırları bir kez daha çekerdi.
      filterEligible: async (userIds) => new Set(userIds),
    },
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
      readMentionSetting(settings, member.userId).types.mentionSelf,
  );

  if (mentionRecipients.length === 0) {
    return;
  }

  const delivery = collectNotificationDelivery(settings, mentionedUserIds, "mentionSelf");
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
      ...maskPushText(locale, delivery.get(member.userId), {
        body: mentionPreview
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
    notificationData.map((row) => [row.notification.userId, row.body] as const),
  );
  const pushTitleByUserId = new Map(
    notificationData.map((row) => [row.notification.userId, row.title] as const),
  );
  await deliverChannelNotifications({
    channelId: args.channelId,
    channelName: args.channelName,
    deliveryByUserId: delivery,
    emitServerUnread: true,
    ...(args.io ? { io: args.io } : {}),
    notifications: notifications as NotificationRecord[],
    pushBodyByUserId,
    pushTitleByUserId,
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
      readMentionSetting(settings, member.userId).types.mentionEveryone,
  );

  if (recipients.length === 0) {
    return;
  }

  const delivery = collectNotificationDelivery(settings, visibleMemberIds, "mentionEveryone");
  const preview = buildMentionPreview(args.content);
  const pushBodyByUserId = new Map<string, string>();
  const pushTitleByUserId = new Map<string, string>();
  const notificationData = recipients.map((member) => {
    const locale = normalizeAppLocale(member.user.locale);
    const push = maskPushText(locale, delivery.get(member.userId), {
      body: preview
        ? translate(locale, "chat.mentions.notifyEveryoneBodyWithMessage", {
            channel: args.channelName,
            name: args.senderName,
            preview,
          })
        : translate(locale, "chat.mentions.notifyEveryoneBody", {
            channel: args.channelName,
            name: args.senderName,
          }),
      title: translate(locale, "chat.mentions.notifyEveryoneTitle"),
    });
    pushBodyByUserId.set(member.userId, push.body);
    pushTitleByUserId.set(member.userId, push.title);

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
    deliveryByUserId: delivery,
    ...(args.io ? { io: args.io } : {}),
    notifications,
    pushBodyByUserId,
    pushTitleByUserId,
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
      readMentionSetting(settings, userId).types.threadReplies &&
      isNotMuted(userId) &&
      !mentionedUserIds.has(userId)
    );
  });

  if (recipientUserIds.length === 0) {
    return;
  }

  // Two kinds in one fan-out. A reply to **your** message is `messageReplies` — the row the
  // design keeps inside `Yalnızca önemli`; a reply somewhere else in a thread you follow is
  // `threadReplies`, which is not. Collapsing them onto one key would either silence the parent
  // author at the default level or promote every followed thread to important.
  const delivery = new Map([
    ...collectNotificationDelivery(
      settings,
      recipientUserIds.filter((userId) => userId === parentAuthorId),
      "messageReplies",
    ),
    ...collectNotificationDelivery(
      settings,
      recipientUserIds.filter((userId) => userId !== parentAuthorId),
      "threadReplies",
    ),
  ]);
  const pushBodyByUserId = new Map<string, string>();
  const pushTitleByUserId = new Map<string, string>();
  const notificationData = recipientUserIds.map((userId) => {
    const locale = normalizeAppLocale(localeByUserId.get(userId) ?? null);
    const push = maskPushText(locale, delivery.get(userId), {
      body: translate(locale, "chat.thread.notifyBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      title: translate(locale, "chat.thread.notifyTitle"),
    });
    pushBodyByUserId.set(userId, push.body);
    pushTitleByUserId.set(userId, push.title);

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
    deliveryByUserId: delivery,
    ...(args.io ? { io: args.io } : {}),
    notifications,
    pushBodyByUserId,
    pushTitleByUserId,
    senderId: args.senderId,
    serverId: args.serverId,
  });
}
