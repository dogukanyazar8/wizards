/**
 * Bildirim istisnaları — üç tablodan tek liste (K4).
 *
 * "İstisna" ürünün bir tablosu **değil**, üç mevcut tablonun ortak sorusudur: bu sunucu, bu
 * kanal ya da bu konuşma genel tercihlerden farklı mı davranıyor? `UserServerSettings`,
 * `UserChannelSettings` ve `DMParticipant` üçünde de düzey ve sessize alma zaten var; dördüncü
 * bir kaynak açmak, aynı bilgiyi iki yerde tutup bir gün ayrıştırmak demekti.
 *
 * Yazma buraya gelmez: `Düzenle` ve kaldır düğmeleri satırın **kendi** ucuna gider
 * (`lib/settings/exceptions-client.ts`). Bu dosyanın tek yazması, süresi geçmiş sessize almanın
 * tembel temizliğidir (§1) — ve o yazma da yalnız burada yapılır.
 */

import type { MessageNotification, PrismaClient } from "@wizards/db";

export type NotificationExceptionScope = "server" | "channel" | "dm";

/**
 * `important` = "yalnızca önemli": düzey varsayılanda kalmış ama `@everyone` / rol bahsetmeleri
 * susturulmuş sunucu. Diğer dördü doğrudan `MessageNotification` / `DMNotifyLevel` karşılığıdır.
 */
export type NotificationExceptionLevel = "all" | "mentions" | "important" | "muted" | "off";

export type NotificationException = {
  /** `${scope}:${scopeId}` — liste anahtarı; kaynak tablo satırının kimliği değil. */
  id: string;
  scope: NotificationExceptionScope;
  scopeId: string;
  /** Sunucu adı · `#kanal` · konuşma adı. */
  name: string;
  iconUrl: string | null;
  level: NotificationExceptionLevel;
  /** ISO. `DMParticipant`'ta süreli sessize alma kolonu yoktur; DM satırları hep `null`. */
  mutedUntil: string | null;
};

export type NotificationExceptionList = {
  items: NotificationException[];
  /** 200'den fazla istisna kesildi; ekran `+{n} daha` yazar. */
  truncated: boolean;
};

/** Sayfalama yok: istisna sayısı doğası gereği küçük. Tavan bir güvenlik kemeri. */
export const NOTIFICATION_EXCEPTION_LIMIT = 200;

const SCOPE_ORDER: Record<NotificationExceptionScope, number> = { server: 0, channel: 1, dm: 2 };

type MutableRow = {
  readonly muted: boolean;
  readonly mutedUntil: Date | null;
};

/**
 * Sessize alma süresi dolmuş mu.
 *
 * `mutedUntil === null` "süresiz" demektir, "geçmiş" değil: `muted` bayrağı tek başına
 * kullanıcının açana kadar süren susturmasıdır.
 */
export function isMuteExpired(row: MutableRow, now: Date): boolean {
  return row.mutedUntil !== null && row.mutedUntil.getTime() <= now.getTime();
}

/** Süre dolmamışsa satır susturulmuş sayılır — `message-notification-service` ile aynı okuma. */
function isEffectivelyMuted(row: MutableRow, now: Date): boolean {
  if (isMuteExpired(row, now)) return false;

  return row.muted || row.mutedUntil !== null;
}

type ServerLikeRow = MutableRow & {
  readonly messageNotifications: MessageNotification;
  readonly suppressEveryone?: boolean;
  readonly suppressRoles?: boolean;
};

/**
 * Satırın düzeyi — ya da `null`: "bu satır bir istisna değil".
 *
 * `DEFAULT` seviyeli ve susturulmamış satır listeye **girmez**. Aksi hâlde `mobilePush`
 * kolonu için bir kez yazılmış her sunucu üyeliği bir istisna gibi görünürdü.
 *
 * Susturma düzeyin önündedir: kanal ucu `muted` düzeyini `NOTHING + muted` olarak yazıyor ve
 * kullanıcı orada `Kapalı` değil `Sessiz` seçtiğini biliyor.
 */
export function resolveExceptionLevel(
  row: ServerLikeRow,
  now: Date,
): NotificationExceptionLevel | null {
  if (isEffectivelyMuted(row, now)) return "muted";

  switch (row.messageNotifications) {
    case "NOTHING":
      return "off";
    case "MENTIONS":
      return "mentions";
    case "ALL":
      return "all";
    default:
      return row.suppressEveryone || row.suppressRoles ? "important" : null;
  }
}

/**
 * `DMParticipant` düzeyi. `muted` kolonu `notifyLevel === NONE`'ın aynasıdır (şema notu), bu
 * yüzden ikisi ayrışmışsa aynayı değil otoriteyi okuruz ve `muted` yalnız etiketi seçer.
 */
export function resolveDmExceptionLevel(
  notifyLevel: "ALL" | "MENTIONS" | "NONE",
  muted: boolean,
): NotificationExceptionLevel | null {
  if (notifyLevel === "MENTIONS") return "mentions";
  if (notifyLevel === "NONE") return muted ? "muted" : "off";

  return null;
}

/** Sıralama: kapsam (sunucu → kanal → konuşma), sonra ad — `tr` collation. */
export function compareNotificationExceptions(
  left: NotificationException,
  right: NotificationException,
): number {
  const byScope = SCOPE_ORDER[left.scope] - SCOPE_ORDER[right.scope];

  if (byScope !== 0) return byScope;

  return left.name.localeCompare(right.name, "tr");
}

export type NotificationExceptionDependencies = {
  readonly database: PrismaClient;
  readonly now?: Date;
};

const SERVER_WHERE_OR = [
  { muted: true },
  { mutedUntil: { not: null } },
  { messageNotifications: { not: "DEFAULT" as const } },
  { suppressEveryone: true },
  { suppressRoles: true },
];

const CHANNEL_WHERE_OR = [
  { muted: true },
  { mutedUntil: { not: null } },
  { messageNotifications: { not: "DEFAULT" as const } },
];

type ExpiredIds = { channel: string[]; server: string[] };

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Süresi geçmiş sessize almaları **bir kez** temizler: kapsam başına tek `updateMany`, okumadan
 * ayrı bir işlem olarak. Satır başına bir yazma, altı istisnası olan bir kullanıcıda altı gidiş
 * dönüş demekti; temizliğin okumaya karışması ise listeyi kendi yan etkisiyle bekletirdi.
 */
async function repairExpiredMutes(
  database: PrismaClient,
  userId: string,
  expired: ExpiredIds,
): Promise<void> {
  const cleared = { muted: false, mutedUntil: null };
  const writes: Array<Promise<unknown>> = [];

  if (expired.server.length > 0) {
    writes.push(
      database.userServerSettings.updateMany({
        data: cleared,
        where: { serverId: { in: expired.server }, userId },
      }),
    );
  }

  if (expired.channel.length > 0) {
    writes.push(
      database.userChannelSettings.updateMany({
        data: cleared,
        where: { channelId: { in: expired.channel }, userId },
      }),
    );
  }

  if (writes.length > 0) await Promise.all(writes);
}

type ConversationNameSource = {
  readonly name: string | null;
  readonly participants: ReadonlyArray<{
    readonly user: { readonly displayName: string | null; readonly username: string };
    readonly userId: string;
  }>;
};

/**
 * Grup adı varsa odur; 1:1 DM'de **karşı tarafın** adıdır. Kendi adını okumak, listede
 * kullanıcıya kendisini bir istisna gibi göstermek demekti.
 */
function resolveConversationName(conversation: ConversationNameSource, viewerId: string): string {
  if (conversation.name) return conversation.name;

  const counterpart = conversation.participants.find(
    (participant) => participant.userId !== viewerId,
  );

  return counterpart?.user.displayName ?? counterpart?.user.username ?? "";
}

export async function listNotificationExceptions(
  userId: string,
  dependencies: NotificationExceptionDependencies,
): Promise<NotificationExceptionList> {
  const { database } = dependencies;
  const now = dependencies.now ?? new Date();

  const [serverRows, channelRows, dmRows] = await Promise.all([
    database.userServerSettings.findMany({
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        server: { select: { iconUrl: true, name: true } },
        serverId: true,
        suppressEveryone: true,
        suppressRoles: true,
      },
      where: { OR: SERVER_WHERE_OR, userId },
    }),
    database.userChannelSettings.findMany({
      select: {
        channel: { select: { name: true } },
        channelId: true,
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
      },
      where: { OR: CHANNEL_WHERE_OR, userId },
    }),
    database.dMParticipant.findMany({
      select: {
        conversation: {
          select: {
            iconUrl: true,
            name: true,
            participants: {
              select: {
                user: { select: { displayName: true, username: true } },
                userId: true,
              },
            },
          },
        },
        conversationId: true,
        muted: true,
        notifyLevel: true,
      },
      where: { notifyLevel: { not: "ALL" }, userId },
    }),
  ]);

  const expired: ExpiredIds = { channel: [], server: [] };
  const items: NotificationException[] = [];

  for (const row of serverRows) {
    const stale = isMuteExpired(row, now);

    if (stale) expired.server.push(row.serverId);

    const level = resolveExceptionLevel(row, now);

    if (!level) continue;

    items.push({
      iconUrl: row.server.iconUrl,
      id: `server:${row.serverId}`,
      level,
      mutedUntil: stale ? null : toIso(row.mutedUntil),
      name: row.server.name,
      scope: "server",
      scopeId: row.serverId,
    });
  }

  for (const row of channelRows) {
    const stale = isMuteExpired(row, now);

    if (stale) expired.channel.push(row.channelId);

    const level = resolveExceptionLevel(row, now);

    if (!level) continue;

    items.push({
      iconUrl: null,
      id: `channel:${row.channelId}`,
      level,
      mutedUntil: stale ? null : toIso(row.mutedUntil),
      name: `#${row.channel.name}`,
      scope: "channel",
      scopeId: row.channelId,
    });
  }

  for (const row of dmRows) {
    const level = resolveDmExceptionLevel(row.notifyLevel, row.muted);

    if (!level) continue;

    items.push({
      iconUrl: row.conversation.iconUrl,
      id: `dm:${row.conversationId}`,
      level,
      // `DMParticipant`'ta süreli sessize alma kolonu yok; DM satırında süre pili çizilmez.
      mutedUntil: null,
      name: resolveConversationName(row.conversation, userId),
      scope: "dm",
      scopeId: row.conversationId,
    });
  }

  await repairExpiredMutes(database, userId, expired);

  items.sort(compareNotificationExceptions);

  return {
    items: items.slice(0, NOTIFICATION_EXCEPTION_LIMIT),
    truncated: items.length > NOTIFICATION_EXCEPTION_LIMIT,
  };
}
