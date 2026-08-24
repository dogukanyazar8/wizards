import type { Prisma } from "@wizards/db";

import { enqueueOutboxJob, OUTBOX_JOB_TYPES } from "@/lib/outbox/service";

/**
 * Etkinlikler Ş3 §4 — hatırlatma işlerinin zamanlanması ve iptali (K5).
 *
 * Kuyruk zaten bir zamanlayıcı: `OutboxJob.availableAt` gelecekteyse drenaj döngüsü işi o
 * ana kadar almıyor. İkinci bir zamanlayıcı süreci yok, dolayısıyla kaybolacak bir timer da
 * yok.
 *
 * Modül veritabanı istemcisini **dışarıdan** alır: hem `prisma`, hem bir transaction
 * istemcisi, hem de testteki kayıt edici aynı dar arayüzü karşılar.
 */

export const SCHEDULED_EVENT_REMINDER_JOB_TYPE = OUTBOX_JOB_TYPES.scheduledEventReminder;

/**
 * Anahtar `startsAt`i taşır. Etkinlik saati değişince **otomatik olarak** yeni bir anahtar
 * doğar; eskisi artık kimsenin yeniden yazmayacağı bir satırdır ve toplu iptale düşer.
 * Anahtara saat konmasaydı, saati değişen bir etkinliğin işi eski `availableAt` ile kuyrukta
 * kalır ve kullanıcı yanlış anda bildirim alırdı.
 */
const REMINDER_KEY_PREFIX = "evt-reminder";

const OUTBOX_STATUS_PENDING = "PENDING";
const OUTBOX_STATUS_CANCELLED = "CANCELLED";

/**
 * Yeniden kuyruğa alınabilir durumlar. `PROCESSING` **bilerek** dışarıda: o an teslim
 * edilmekte olan bir işin kiralaması ezilirse iki worker aynı bildirimi gönderebilir.
 */
const REQUEUABLE_STATUSES = [
  OUTBOX_STATUS_PENDING,
  OUTBOX_STATUS_CANCELLED,
  "COMPLETED",
  "FAILED",
] as const;

export type EventReminderSchedulerClient = {
  readonly outboxJob: {
    updateMany(args: Prisma.OutboxJobUpdateManyArgs): Promise<{ count: number }>;
    upsert(args: Prisma.OutboxJobUpsertArgs): Promise<unknown>;
  };
  readonly scheduledEventReminder: {
    findMany(args: {
      select: { minutesBefore: true; userId: true };
      where: { enabled: true; eventId: string };
    }): Promise<readonly { readonly minutesBefore: number; readonly userId: string }[]>;
  };
  readonly userNotificationSettings: {
    findMany(args: {
      select: { eventNotifications: true; userId: true };
      where: { userId: { in: string[] } };
    }): Promise<readonly { readonly eventNotifications: boolean; readonly userId: string }[]>;
  };
};

export type EventReminderKeyInput = {
  readonly eventId: string;
  readonly startsAt: Date;
  readonly userId: string;
};

export function buildEventReminderIdempotencyKey(input: EventReminderKeyInput): string {
  return `${REMINDER_KEY_PREFIX}:${input.eventId}:${input.userId}:${input.startsAt.getTime()}`;
}

function reminderKeyPrefix(eventId: string, userId?: string): string {
  return userId === undefined
    ? `${REMINDER_KEY_PREFIX}:${eventId}:`
    : `${REMINDER_KEY_PREFIX}:${eventId}:${userId}:`;
}

export function resolveEventReminderAvailableAt(startsAt: Date, minutesBefore: number): Date {
  return new Date(startsAt.getTime() - minutesBefore * 60_000);
}

export type EventReminderSkipReason = "disabled" | "notifications-off" | "past";

export type ScheduleEventReminderResult = {
  readonly reason: EventReminderSkipReason | null;
  readonly scheduled: boolean;
};

export type ScheduleEventReminderInput = {
  readonly enabled: boolean;
  readonly eventId: string;
  /** K7 — hesap seviyesindeki zil. Kapalıysa iş **hiç** yazılmaz. */
  readonly eventNotificationsEnabled: boolean;
  readonly minutesBefore: number;
  readonly now: Date;
  readonly startsAt: Date;
  readonly userId: string;
};

export async function cancelEventReminderJobs(
  client: Pick<EventReminderSchedulerClient, "outboxJob">,
  input: { readonly eventId: string; readonly userId?: string },
): Promise<number> {
  const { count } = await client.outboxJob.updateMany({
    data: { status: OUTBOX_STATUS_CANCELLED },
    where: {
      idempotencyKey: { startsWith: reminderKeyPrefix(input.eventId, input.userId) },
      status: OUTBOX_STATUS_PENDING,
      type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
    },
  });

  return count;
}

export async function scheduleEventReminderJob(
  client: Pick<EventReminderSchedulerClient, "outboxJob">,
  input: ScheduleEventReminderInput,
): Promise<ScheduleEventReminderResult> {
  if (!input.enabled) {
    await cancelEventReminderJobs(client, { eventId: input.eventId, userId: input.userId });
    return { reason: "disabled", scheduled: false };
  }

  if (!input.eventNotificationsEnabled) {
    await cancelEventReminderJobs(client, { eventId: input.eventId, userId: input.userId });
    return { reason: "notifications-off", scheduled: false };
  }

  const availableAt = resolveEventReminderAvailableAt(input.startsAt, input.minutesBefore);

  /**
   * Tuzak #8 — geçmişte kalan hatırlatma kuyruğa **yazılmaz**. Etkinlik 5 dk sonraysa ve
   * tercih 10 dk ise `availableAt` geride kalır; drenaj döngüsü onu hemen alır ve kullanıcı
   * "başlamasına 10 dk" diyen bir bildirimi etkinlik başladıktan sonra görür. Sınır dâhil:
   * tam `now` olan bir iş de zaten gecikmiş sayılır.
   */
  if (availableAt.getTime() <= input.now.getTime()) {
    return { reason: "past", scheduled: false };
  }

  const idempotencyKey = buildEventReminderIdempotencyKey({
    eventId: input.eventId,
    startsAt: input.startsAt,
    userId: input.userId,
  });
  const payload = {
    eventId: input.eventId,
    minutesBefore: input.minutesBefore,
    userId: input.userId,
  } satisfies Prisma.InputJsonValue;

  /**
   * Önce yeniden kuyruğa alma denenir. `enqueueOutboxJob` `update: {}` ile upsert ediyor;
   * aynı anahtar daha önce `CANCELLED`a çekildiyse (kullanıcı hatırlatmayı kapatıp yeniden
   * açtı) ya da `minutesBefore` değiştiyse, tek başına upsert satırı **olduğu gibi bırakır**
   * ve tercih sessizce yerine gelmez.
   */
  const requeued = await client.outboxJob.updateMany({
    data: {
      attempts: 0,
      availableAt,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      payload,
      status: OUTBOX_STATUS_PENDING,
    },
    where: {
      idempotencyKey,
      status: { in: [...REQUEUABLE_STATUSES] },
      type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
    },
  });

  if (requeued.count === 0) {
    await enqueueOutboxJob(client, {
      availableAt,
      idempotencyKey,
      payload,
      type: SCHEDULED_EVENT_REMINDER_JOB_TYPE,
    });
  }

  return { reason: null, scheduled: true };
}

export type RescheduleEventRemindersResult = {
  readonly cancelled: number;
  readonly scheduled: number;
  readonly skipped: number;
};

/**
 * Etkinlik saati değişti: **bütün** hatırlatma işleri yeniden zamanlanır.
 *
 * Sıra bağlayıcı — önce toplu iptal, sonra yazma. Yeni anahtarlar eskilerden farklı olduğu
 * için ters sırada eski işler kuyrukta kalır ve kullanıcı iki bildirim alır.
 */
export async function rescheduleEventReminderJobs(
  client: EventReminderSchedulerClient,
  input: { readonly eventId: string; readonly now: Date; readonly startsAt: Date },
): Promise<RescheduleEventRemindersResult> {
  const cancelled = await cancelEventReminderJobs(client, { eventId: input.eventId });

  const reminders = await client.scheduledEventReminder.findMany({
    select: { minutesBefore: true, userId: true },
    where: { enabled: true, eventId: input.eventId },
  });

  if (reminders.length === 0) {
    return { cancelled, scheduled: 0, skipped: 0 };
  }

  const settings = await client.userNotificationSettings.findMany({
    select: { eventNotifications: true, userId: true },
    where: { userId: { in: reminders.map((reminder) => reminder.userId) } },
  });
  // Satırı olmayan kullanıcı varsayılanı taşır (`@default(true)`); yokluk "kapalı" demek
  // değildir.
  const disabledUserIds = new Set(
    settings.filter((row) => !row.eventNotifications).map((row) => row.userId),
  );

  let scheduled = 0;
  let skipped = 0;

  for (const reminder of reminders) {
    const result = await scheduleEventReminderJob(client, {
      enabled: true,
      eventId: input.eventId,
      eventNotificationsEnabled: !disabledUserIds.has(reminder.userId),
      minutesBefore: reminder.minutesBefore,
      now: input.now,
      startsAt: input.startsAt,
      userId: reminder.userId,
    });

    if (result.scheduled) {
      scheduled += 1;
    } else {
      skipped += 1;
    }
  }

  return { cancelled, scheduled, skipped };
}
