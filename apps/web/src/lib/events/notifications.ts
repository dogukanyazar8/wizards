import { prisma, type Prisma } from "@wizards/db";
import { z } from "zod";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { getSocketServer } from "@/lib/socket/runtime";
import { chunkForFanOut } from "@/lib/workspace/message-notification-service";

/**
 * Etkinlikler Ş3 — iki outbox işinin gövdesi (K5 hatırlatma, §3 oluşturma fan-out'u).
 *
 * `lib/outbox/service.ts` yalnız **çağırır**: dosya bugün dokuz iş tipinin gövdesini taşıyor
 * ve etkinlik metinleri onunla birlikte büyümesin diye burada duruyor.
 *
 * Bildirim tipi `SYSTEM` kalıyor: `NotificationType` enum'una bir üye eklemek migration ister
 * ve bu şerit şemayı sahiplenmiyor. Ayrım `metadata.eventId` ile yapılıyor — thread yanıtı
 * bildirimlerinin bugün izlediği desenin aynısı.
 */

export const ScheduledEventReminderPayloadSchema = z.object({
  eventId: z.string().min(1),
  minutesBefore: z.number().int().positive(),
  userId: z.string().min(1),
});
export type ScheduledEventReminderPayload = z.infer<typeof ScheduledEventReminderPayloadSchema>;

export const ScheduledEventCreatedNotificationsPayloadSchema = z.object({
  eventId: z.string().min(1),
});
export type ScheduledEventCreatedNotificationsPayload = z.infer<
  typeof ScheduledEventCreatedNotificationsPayloadSchema
>;

export type EventNotificationEventRow = {
  readonly channelId: string | null;
  readonly creatorId: string;
  readonly id: string;
  readonly name: string;
  readonly scheduledStartAt: Date;
  readonly server: { readonly id: string; readonly name: string } | null;
  readonly serverId: string;
  readonly status: string;
};

export type EventNotificationDraft = {
  readonly actionUrl: string;
  readonly body: string;
  readonly dedupeKey: string;
  readonly metadata: Prisma.InputJsonValue;
  readonly title: string;
  readonly type: "SYSTEM";
  readonly userId: string;
};

export type EventNotificationRecord = EventNotificationDraft & { readonly id: string };

export type EventNotificationDependencies = {
  createNotifications(
    rows: readonly EventNotificationDraft[],
  ): Promise<readonly EventNotificationRecord[]>;
  findEvent(eventId: string): Promise<EventNotificationEventRow | null>;
  findReminder(
    eventId: string,
    userId: string,
  ): Promise<{ readonly enabled: boolean; readonly minutesBefore: number } | null>;
  findUser(userId: string): Promise<{ readonly locale: string | null } | null>;
  listNotifiableMemberIds(
    serverId: string,
    excludeUserId: string,
  ): Promise<readonly { readonly id: string; readonly locale: string | null }[]>;
  now(): Date;
  push(
    rows: readonly { readonly userId: string; readonly body: string; readonly title: string }[],
  ): Promise<void>;
  /** `eventNotifications = false` olan kullanıcıların kümesi. */
  readEventNotificationsEnabled(userIds: readonly string[]): Promise<ReadonlySet<string>>;
};

/** Kartın açıldığı adres; bildirime tıklayan doğrudan detay paneline düşer. */
function eventActionUrl(eventId: string): string {
  return `/events?panel=${eventId}`;
}

function isEventNotifiable(
  event: EventNotificationEventRow | null,
): event is EventNotificationEventRow {
  return event !== null && event.status !== "CANCELLED" && event.status !== "COMPLETED";
}

const EVENT_NOTIFICATION_DATE_OPTIONS = {
  day: "numeric",
  month: "long",
} as const;

const EVENT_NOTIFICATION_TIME_OPTIONS = {
  hour: "2-digit",
  minute: "2-digit",
} as const;

function formatEventMoment(startsAt: Date, locale: string) {
  const tag = locale === "tr" ? "tr-TR" : "en-US";

  return {
    day: new Intl.DateTimeFormat(tag, EVENT_NOTIFICATION_DATE_OPTIONS).format(startsAt),
    time: new Intl.DateTimeFormat(tag, {
      ...EVENT_NOTIFICATION_TIME_OPTIONS,
      hourCycle: "h23",
    }).format(startsAt),
  };
}

/* --------------------------------------------------------------- hatırlatma */

export async function processScheduledEventReminderJob(
  payload: ScheduledEventReminderPayload,
  dependencies: EventNotificationDependencies = defaultEventNotificationDependencies,
): Promise<void> {
  const event = await dependencies.findEvent(payload.eventId);

  // İptal edilen ya da silinen etkinliğin işi kuyrukta kalmış olabilir; drenaj anında
  // durumu yeniden okumak, "başlamasına 10 dk" diyen bir bildirimin iptal edilmiş bir
  // etkinlik için gitmesini engelleyen tek şey.
  if (!isEventNotifiable(event)) {
    return;
  }

  const reminder = await dependencies.findReminder(payload.eventId, payload.userId);

  // Tercih arada kapatılmış olabilir: kuyruktaki iş kullanıcının son kararını geçersiz kılamaz.
  if (reminder && !reminder.enabled) {
    return;
  }

  const disabled = await dependencies.readEventNotificationsEnabled([payload.userId]);

  if (disabled.has(payload.userId)) {
    return;
  }

  const user = await dependencies.findUser(payload.userId);
  const locale = normalizeAppLocale(user?.locale ?? null);
  const minutesBefore = reminder?.minutesBefore ?? payload.minutesBefore;

  const [notification] = await dependencies.createNotifications([
    {
      actionUrl: eventActionUrl(event.id),
      body: translate(locale, "events.notify.reminderBody", {
        minutes: minutesBefore,
        title: event.name,
      }),
      // Anahtar `startsAt` taşıyor: saati değişen etkinliğin yeni işi ayrı bir satır yazar,
      // eskisi ise zaten `CANCELLED`.
      dedupeKey: `event-reminder:${event.id}:${payload.userId}:${event.scheduledStartAt.getTime()}`,
      metadata: {
        eventId: event.id,
        minutesBefore,
        serverId: event.serverId,
        startsAt: event.scheduledStartAt.toISOString(),
      },
      title: translate(locale, "events.notify.reminderTitle"),
      type: "SYSTEM",
      userId: payload.userId,
    },
  ]);

  if (!notification) {
    return;
  }

  emitEventNotifications([notification]);
  await dependencies.push([notification]);
}

/* -------------------------------------------------------------- fan-out (§3) */

export async function processScheduledEventCreatedNotificationsJob(
  payload: ScheduledEventCreatedNotificationsPayload,
  dependencies: EventNotificationDependencies = defaultEventNotificationDependencies,
): Promise<void> {
  const event = await dependencies.findEvent(payload.eventId);

  if (!isEventNotifiable(event)) {
    return;
  }

  const members = await dependencies.listNotifiableMemberIds(event.serverId, event.creatorId);

  if (members.length === 0) {
    return;
  }

  const disabled = await dependencies.readEventNotificationsEnabled(
    members.map((member) => member.id),
  );
  const recipients = members.filter((member) => !disabled.has(member.id));

  if (recipients.length === 0) {
    return;
  }

  const serverName = event.server?.name ?? "";
  const drafts = recipients.map((member) => {
    const locale = normalizeAppLocale(member.locale);
    const moment = formatEventMoment(event.scheduledStartAt, locale);

    return {
      actionUrl: eventActionUrl(event.id),
      body: translate(locale, "events.notify.createdBody", {
        day: moment.day,
        server: serverName,
        time: moment.time,
        title: event.name,
      }),
      dedupeKey: `event-created:${event.id}:${member.id}`,
      metadata: {
        eventId: event.id,
        serverId: event.serverId,
        startsAt: event.scheduledStartAt.toISOString(),
      },
      title: translate(locale, "events.notify.createdTitle"),
      type: "SYSTEM" as const,
      userId: member.id,
    } satisfies EventNotificationDraft;
  });

  const notifications: EventNotificationRecord[] = [];

  // Tuzak: 2.000 üyeli bir sunucuda tek `createMany` o deyim boyunca kilit tutar.
  for (const batch of chunkForFanOut(drafts)) {
    notifications.push(...(await dependencies.createNotifications(batch)));
  }

  emitEventNotifications(notifications);
  await dependencies.push(notifications);
}

/* ----------------------------------------------------------------- varsayılan */

/**
 * TODO(Ş4): `notification:new` bugün genel bildirim kanalından yayılıyor; etkinliğe özgü
 * `event:created` / `event:rsvp` olayları Ş4'ün sözlüğünde.
 */
function emitEventNotifications(notifications: readonly EventNotificationRecord[]): void {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  const createdAt = new Date().toISOString();

  for (const notification of notifications) {
    io.to(`user:${notification.userId}`).emit("notification:new", {
      actionUrl: notification.actionUrl,
      actor: null,
      body: notification.body,
      createdAt,
      id: notification.id,
      imageUrl: null,
      metadata: notification.metadata as Record<string, unknown>,
      read: false,
      readAt: null,
      title: notification.title,
      type: "SYSTEM",
      userId: notification.userId,
    });
  }
}

export const defaultEventNotificationDependencies: EventNotificationDependencies = {
  createNotifications: async (rows) => {
    const created = await prisma.notification.createManyAndReturn({
      data: rows.map((row) => ({
        actionUrl: row.actionUrl,
        body: row.body,
        dedupeKey: row.dedupeKey,
        metadata: row.metadata,
        title: row.title,
        type: row.type,
        userId: row.userId,
      })),
      // Aynı işi iki kez drene eden bir worker satırı çoğaltmaz.
      skipDuplicates: true,
    });

    return created as unknown as EventNotificationRecord[];
  },
  findEvent: (eventId) =>
    prisma.scheduledEvent.findUnique({
      select: {
        channelId: true,
        creatorId: true,
        id: true,
        name: true,
        scheduledStartAt: true,
        server: { select: { id: true, name: true } },
        serverId: true,
        status: true,
      },
      where: { id: eventId },
    }),
  findReminder: (eventId, userId) =>
    prisma.scheduledEventReminder.findUnique({
      select: { enabled: true, minutesBefore: true },
      where: { eventId_userId: { eventId, userId } },
    }),
  findUser: (userId) => prisma.user.findUnique({ select: { locale: true }, where: { id: userId } }),
  listNotifiableMemberIds: async (serverId, excludeUserId) => {
    const members = await prisma.serverMember.findMany({
      orderBy: { userId: "asc" },
      select: { user: { select: { id: true, locale: true } } },
      where: { serverId, userId: { not: excludeUserId } },
    });

    return members.map((member) => member.user);
  },
  now: () => new Date(),
  push: async (rows) => {
    await sendMobilePushForNotifications(
      rows.map((row) => ({
        actionUrl: (row as EventNotificationRecord).actionUrl,
        body: row.body,
        id: (row as EventNotificationRecord).id,
        title: row.title,
        type: "SYSTEM",
        userId: row.userId,
      })),
    ).catch(() => undefined);
  },
  readEventNotificationsEnabled: async (userIds) => {
    const settings = await prisma.userNotificationSettings.findMany({
      select: { eventNotifications: true, userId: true },
      where: { userId: { in: [...userIds] } },
    });

    // Satırı olmayan kullanıcı şema varsayılanını (`true`) taşır; yokluk "kapalı" değildir.
    return new Set(settings.filter((row) => !row.eventNotifications).map((row) => row.userId));
  },
};
