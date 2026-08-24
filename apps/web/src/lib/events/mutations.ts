import type { Prisma, PrismaClient } from "@wizards/db";
import {
  EVENT_REMINDER_DEFAULT_MINUTES,
  type EventCounts,
  type EventKind,
  type EventRsvp,
  type SetEventReminderInput,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  getEventDetail,
  type EventDetailDependencies,
  type EventDetailResponse,
} from "@/lib/events/detail-service";
import {
  buildEventsCountsQuery,
  EMPTY_EVENTS_COUNTS_ROW,
  type EventsCountsRow,
} from "@/lib/events/events-query";
import {
  defaultEventsTimeZoneReader,
  type EventsTimeZoneReader,
} from "@/lib/events/events-service";
import {
  cancelEventReminderJobs,
  scheduleEventReminderJob,
  type EventReminderSchedulerClient,
} from "@/lib/events/reminder-scheduler";
import { listViewerServerIds } from "@/lib/home/service";
import { OUTBOX_JOB_TYPES, enqueueOutboxJob } from "@/lib/outbox/service";
import { ensureEventPermission, getAccessContext } from "@/lib/workspace/access-context";

/**
 * Etkinlikler Ş3 — yazma yolu: oluşturma, RSVP, hatırlatma.
 *
 * Okuma projeksiyonu bu dosyada **tekrarlanmaz**: yanıtlar Ş2'nin `getEventDetail`i ve Ş1'in
 * sayaç sorgusu üzerinden kurulur. İkinci bir projeksiyon yazmak, aynı etkinliğin yazma ve
 * okuma yanıtlarında farklı görünmesinin en kısa yolu.
 */

/* ------------------------------------------------------------------ K1 · RSVP */

/**
 * Kolon enum'u üretilen istemcinin adlandırılmış dışa aktarımları arasında değil; `detail-
 * service.ts` ile aynı biçimde yük tipinden türetiliyor ki ikinci bir birlik tipi elle
 * yazılmasın.
 */
export type ScheduledEventRsvpStatus = Prisma.ScheduledEventInterestGetPayload<{
  select: { status: true };
}>["status"];

export type EventRsvpCounterDelta = {
  readonly going: number;
  readonly maybe: number;
};

const NO_DELTA: EventRsvpCounterDelta = { going: 0, maybe: 0 };

/**
 * Sayaç deltası **yalnız satır gerçekten değiştiyse** oynar. Dokuz geçişin tamamı burada;
 * çağrı yerlerinde `if (interested)` biçiminde tekrarlanmaz, çünkü `MAYBE`nin geldiği gün o
 * dallardan biri unutulur.
 */
export function resolveEventRsvpDelta(
  previous: ScheduledEventRsvpStatus | null,
  next: ScheduledEventRsvpStatus | null,
): EventRsvpCounterDelta {
  if (previous === next) {
    return NO_DELTA;
  }

  const going = (next === "GOING" ? 1 : 0) - (previous === "GOING" ? 1 : 0);
  const maybe = (next === "MAYBE" ? 1 : 0) - (previous === "MAYBE" ? 1 : 0);

  return { going, maybe };
}

export type EventRsvpWriteClient = {
  readonly scheduledEvent: {
    update(args: Prisma.ScheduledEventUpdateArgs): Promise<unknown>;
  };
  readonly scheduledEventInterest: {
    createMany(args: Prisma.ScheduledEventInterestCreateManyArgs): Promise<{ count: number }>;
    deleteMany(args: Prisma.ScheduledEventInterestDeleteManyArgs): Promise<{ count: number }>;
    updateMany(args: Prisma.ScheduledEventInterestUpdateManyArgs): Promise<{ count: number }>;
  };
};

export type EventRsvpWriteResult = {
  readonly changed: boolean;
  readonly delta: EventRsvpCounterDelta;
  readonly rsvp: ScheduledEventRsvpStatus | null;
};

/**
 * Hedef durumu yazar ve **gözlenen** önceki durumdan deltayı türetir.
 *
 * Önce okuyup sonra yazmak yerine her adım tek atomik deyim: `updateMany` yalnız karşı
 * yanıttaki satırı çevirir, `createMany` `skipDuplicates` ile tekilliğe yaslanır. İki
 * eşzamanlı `going` isteğinde biri satırı yaratır (count 1), diğeri atlar (count 0) —
 * dolayısıyla tek satır ve tek artış olur. Okuma-sonra-yazma bunu iki artışa çevirirdi.
 */
export async function writeEventRsvpRow(
  client: Pick<EventRsvpWriteClient, "scheduledEventInterest">,
  input: {
    readonly eventId: string;
    readonly rsvp: ScheduledEventRsvpStatus | null;
    readonly userId: string;
  },
): Promise<EventRsvpWriteResult> {
  const { eventId, rsvp, userId } = input;

  if (rsvp === null) {
    // İki ayrı `deleteMany`: hangi sayacın düşeceğini etkilenen satır sayısı söyler.
    const going = await client.scheduledEventInterest.deleteMany({
      where: { eventId, status: "GOING", userId },
    });
    const maybe = await client.scheduledEventInterest.deleteMany({
      where: { eventId, status: "MAYBE", userId },
    });
    const previous = going.count > 0 ? "GOING" : maybe.count > 0 ? "MAYBE" : null;

    return {
      changed: previous !== null,
      delta: resolveEventRsvpDelta(previous, null),
      rsvp: null,
    };
  }

  const other: ScheduledEventRsvpStatus = rsvp === "GOING" ? "MAYBE" : "GOING";
  const flipped = await client.scheduledEventInterest.updateMany({
    data: { status: rsvp },
    where: { eventId, status: other, userId },
  });

  if (flipped.count > 0) {
    return { changed: true, delta: resolveEventRsvpDelta(other, rsvp), rsvp };
  }

  const created = await client.scheduledEventInterest.createMany({
    data: [{ eventId, status: rsvp, userId }],
    skipDuplicates: true,
  });

  // `count === 0` tek bir şey demek: satır zaten bu yanıtı taşıyordu.
  return created.count > 0
    ? { changed: true, delta: resolveEventRsvpDelta(null, rsvp), rsvp }
    : { changed: false, delta: NO_DELTA, rsvp };
}

/** Delta sıfırsa deyim hiç çıkmaz: değişmeyen bir tık satır kilidi almaz. */
export async function applyEventRsvpCounters(
  client: Pick<EventRsvpWriteClient, "scheduledEvent">,
  eventId: string,
  delta: EventRsvpCounterDelta,
): Promise<void> {
  if (delta.going === 0 && delta.maybe === 0) {
    return;
  }

  await client.scheduledEvent.update({
    data: {
      ...(delta.going === 0
        ? {}
        : {
            interestedCount:
              delta.going > 0 ? { increment: delta.going } : { decrement: -delta.going },
          }),
      ...(delta.maybe === 0
        ? {}
        : {
            maybeCount: delta.maybe > 0 ? { increment: delta.maybe } : { decrement: -delta.maybe },
          }),
    },
    select: { id: true },
    where: { id: eventId },
  });
}

/* --------------------------------------------------------- K10 · yer kuralları */

/**
 * K10 — `Yayına katıl` CTA'sının gideceği yer garanti altına alınır. Metin kanalına konmuş bir
 * canlı yayın o butonu anlamsız yapar.
 */
export const EVENT_KIND_CHANNEL_TYPES = {
  community: ["STAGE"],
  game: ["VOICE"],
  live: ["STAGE"],
  meeting: ["TEXT", "VOICE"],
  voice: ["VOICE"],
  workshop: ["TEXT", "VOICE"],
} as const satisfies Readonly<Record<EventKind, readonly string[]>>;

export function assertEventChannelMatchesKind(kind: EventKind, channelType: string): void {
  if (!(EVENT_KIND_CHANNEL_TYPES[kind] as readonly string[]).includes(channelType)) {
    throw new ApiError(
      "This event kind cannot be hosted in that channel.",
      422,
      "EVENT_KIND_CHANNEL_MISMATCH",
    );
  }
}

/**
 * `entityType` **canlı yüzeyi** anlatır, sunum türünü değil (o `kind`).
 *
 * Metin kanalı `EXTERNAL`e düşer: üç üyeli enum'da metin kanalının karşılığı yok ve bir metin
 * kanalının sesli yüzeyi de yok — `VOICE` ya da `STAGE` yazmak `attendeeCount`u ve
 * `canJoinLive`ı yalan yapardı. `externalLocation` yine `null` kalır, kart yerini kanal
 * adından yazar.
 */
export function resolveEventEntityType(input: {
  readonly channelType: string | null;
  readonly externalLocation: string | null;
}): "EXTERNAL" | "STAGE" | "VOICE" {
  if (input.externalLocation !== null || input.channelType === null) {
    return "EXTERNAL";
  }

  if (input.channelType === "STAGE") {
    return "STAGE";
  }

  return input.channelType === "VOICE" ? "VOICE" : "EXTERNAL";
}

const SCHEDULED_EVENT_KIND_BY_KIND = {
  community: "COMMUNITY",
  game: "GAME",
  live: "LIVE",
  meeting: "MEETING",
  voice: "VOICE",
  workshop: "WORKSHOP",
} as const;

export function toScheduledEventKind(
  kind: EventKind,
): (typeof SCHEDULED_EVENT_KIND_BY_KIND)[EventKind] {
  return SCHEDULED_EVENT_KIND_BY_KIND[kind];
}

const SCHEDULED_EVENT_RSVP_BY_RSVP = { going: "GOING", maybe: "MAYBE" } as const;

export function toScheduledEventRsvpStatus(
  rsvp: EventRsvp | null,
): ScheduledEventRsvpStatus | null {
  return rsvp === null ? null : SCHEDULED_EVENT_RSVP_BY_RSVP[rsvp];
}

/**
 * Tasarımdaki saat seçici dakikayı yuvarlıyor ve istek yolda geçen saniyeleri de taşıyor;
 * tolerans olmadan "şimdi başlat" isteği kendi gecikmesine takılırdı.
 */
export const EVENT_START_TOLERANCE_MS = 5 * 60 * 1000;

export function assertEventStartsInFuture(startsAt: Date, now: Date): void {
  if (startsAt.getTime() < now.getTime() - EVENT_START_TOLERANCE_MS) {
    throw new ApiError("An event cannot start in the past.", 422, "EVENT_START_IN_PAST");
  }
}

/** K3 — herkese açıklık `isPublic` bayrağıdır ve yalnız topluluk sunucusunda anlamlıdır. */
export function assertPublicEventAllowed(isPublic: boolean, serverType: string): void {
  if (isPublic && serverType !== "COMMUNITY") {
    throw new ApiError(
      "Only community servers can list events in Keşfet.",
      422,
      "EVENT_PUBLIC_REQUIRES_COMMUNITY",
    );
  }
}

/* ------------------------------------------------------------------- sayaçlar */

export type EventMutationDatabase = PrismaClient;

/**
 * Tuzak #3 — sayaçlar **filtresizdir**. `time/source/mine/q` uygulanmaz; uygulansaydı bir
 * filtre açıkken bütün sekmeler `0` görünür ve tıklanamaz sanılırdı.
 *
 * Ş1'in `listEvents`i aynı sorguyu kullanıyor; yazma yanıtı ikinci bir toplama yazmıyor ki
 * sekme pili ile başlık alt satırı bir gün ayrışmasın.
 */
export async function readEventCounts(
  database: EventMutationDatabase,
  input: { readonly now: Date; readonly timeZone: string; readonly userId: string },
): Promise<EventCounts> {
  const viewerServerIds = await listViewerServerIds(database, input.userId);
  const rows = await database.$queryRaw<EventsCountsRow[]>(
    buildEventsCountsQuery({
      mine: null,
      now: input.now,
      query: null,
      serverId: null,
      tab: "all",
      time: null,
      timeZone: input.timeZone,
      userId: input.userId,
      viewerServerIds,
      weekStart: null,
    }),
  );
  const counts = rows[0] ?? EMPTY_EVENTS_COUNTS_ROW;

  return {
    all: counts.all,
    going: counts.going,
    live: counts.live,
    liveNow: counts.live > 0,
    nextStartsAt: counts.nextStartsAt ? counts.nextStartsAt.toISOString() : null,
    upcoming: counts.upcoming,
  };
}

/* ------------------------------------------------------------------- servisler */

export type EventMutationDependencies = {
  readonly database: EventMutationDatabase;
  readonly now: Date;
  readonly readViewerTimeZone?: EventsTimeZoneReader;
  readonly requestTimeZone?: string | null;
};

export type EventWriteResponse = {
  readonly counts: EventCounts;
  readonly event: EventDetailResponse;
  /** K5 — hatırlatma işi gerçekten kuyruğa yazıldı mı (tuzak #8). */
  readonly scheduled: boolean;
};

type EventAccessRow = {
  readonly id: string;
  readonly isPublic: boolean;
  readonly scheduledStartAt: Date;
  readonly serverId: string;
  readonly status: string;
};

/**
 * Görünürlük **sorgunun süzgeci**, sonuca uygulanan bir kontrol değil: satır gelmezse
 * etkinlik bu izleyici için yoktur ve 404 döner. K3'ün amacı gereği herkese açık bir
 * etkinliğe üye olmayan da yanıt verebilir.
 */
async function requireVisibleEvent(
  database: EventMutationDatabase,
  eventId: string,
  viewerId: string,
): Promise<EventAccessRow> {
  const row = await database.scheduledEvent.findFirst({
    select: { id: true, isPublic: true, scheduledStartAt: true, serverId: true, status: true },
    where: {
      OR: [{ server: { members: { some: { userId: viewerId } } } }, { isPublic: true }],
      id: eventId,
    },
  });

  if (!row) {
    throw new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND");
  }

  return row;
}

async function readEventNotificationsEnabled(
  database: EventMutationDatabase,
  userId: string,
): Promise<boolean> {
  const settings = await database.userNotificationSettings.findUnique({
    select: { eventNotifications: true },
    where: { userId },
  });

  // Satırı olmayan kullanıcı şema varsayılanını taşır; yokluk "kapalı" demek değil.
  return settings?.eventNotifications ?? true;
}

async function buildEventWriteResponse(
  dependencies: EventMutationDependencies,
  input: { readonly eventId: string; readonly scheduled: boolean; readonly userId: string },
): Promise<EventWriteResponse> {
  const readViewerTimeZone = dependencies.readViewerTimeZone ?? defaultEventsTimeZoneReader;
  const detailDependencies: EventDetailDependencies = {
    database: dependencies.database,
    now: dependencies.now,
    ...(dependencies.requestTimeZone === undefined
      ? {}
      : { requestTimeZone: dependencies.requestTimeZone }),
  };

  const [event, timeZone] = await Promise.all([
    getEventDetail(input.userId, input.eventId, {}, detailDependencies),
    readViewerTimeZone(input.userId),
  ]);

  return {
    counts: await readEventCounts(dependencies.database, {
      now: dependencies.now,
      timeZone,
      userId: input.userId,
    }),
    event,
    scheduled: input.scheduled,
  };
}

export type EventRsvpTransactionClient = EventRsvpWriteClient &
  Pick<EventReminderSchedulerClient, "outboxJob"> & {
    readonly scheduledEventReminder: {
      findUnique(args: {
        select: { enabled: true; minutesBefore: true };
        where: { eventId_userId: { eventId: string; userId: string } };
      }): Promise<{ readonly enabled: boolean; readonly minutesBefore: number } | null>;
      updateMany(args: {
        data: { enabled: boolean };
        where: { eventId: string; userId: string };
      }): Promise<{ count: number }>;
      upsert(args: {
        create: { enabled: boolean; eventId: string; minutesBefore: number; userId: string };
        update: Record<string, never>;
        where: { eventId_userId: { eventId: string; userId: string } };
      }): Promise<unknown>;
    };
  };

export type EventRsvpTransactionInput = {
  readonly eventId: string;
  /** K7 — hesap seviyesindeki zil; kapalıysa iş **hiç** yazılmaz. */
  readonly eventNotificationsEnabled: boolean;
  readonly now: Date;
  readonly rsvp: ScheduledEventRsvpStatus | null;
  readonly startsAt: Date;
  readonly userId: string;
};

export type EventRsvpTransactionResult = {
  readonly delta: EventRsvpCounterDelta;
  readonly scheduled: boolean;
};

/**
 * RSVP'nin **tek transaction**'ı: satır, iki sayaç, hatırlatma tercihi ve outbox işi.
 *
 * `maybe → going` geçişinde ara bir anda toplam yanlış görünmez; süreç ortada ölse sayaç
 * satırlardan kopmaz; commit olan bir RSVP'nin hatırlatması kaybolamaz. Ayrı bir fonksiyon
 * olarak duruyor ki gövdesi bir `PrismaClient` kurmadan sınanabilsin.
 */
export async function runEventRsvpTransaction(
  transaction: EventRsvpTransactionClient,
  input: EventRsvpTransactionInput,
): Promise<EventRsvpTransactionResult> {
  const { eventId, rsvp, userId } = input;
  const written = await writeEventRsvpRow(transaction, { eventId, rsvp, userId });
  await applyEventRsvpCounters(transaction, eventId, written.delta);

  if (rsvp === "GOING") {
    // "Hatırlatma satırı **yoksa**" — `update: {}` mevcut tercihi olduğu gibi bırakır.
    // Kullanıcının 30 dakikaya çektiği bir hatırlatma ikinci `Katıl` tıkında 10'a dönmez.
    await transaction.scheduledEventReminder.upsert({
      create: {
        enabled: true,
        eventId,
        minutesBefore: EVENT_REMINDER_DEFAULT_MINUTES,
        userId,
      },
      update: {},
      where: { eventId_userId: { eventId, userId } },
    });

    const reminder = await transaction.scheduledEventReminder.findUnique({
      select: { enabled: true, minutesBefore: true },
      where: { eventId_userId: { eventId, userId } },
    });

    const result = await scheduleEventReminderJob(transaction, {
      enabled: reminder?.enabled ?? true,
      eventId,
      eventNotificationsEnabled: input.eventNotificationsEnabled,
      minutesBefore: reminder?.minutesBefore ?? EVENT_REMINDER_DEFAULT_MINUTES,
      now: input.now,
      startsAt: input.startsAt,
      userId,
    });

    return { delta: written.delta, scheduled: result.scheduled };
  }

  if (rsvp === null) {
    // Katılım geri alındı: tercih satırı **silinmez**, kapatılır. Silmek, kullanıcının
    // seçtiği dakikayı da silmek olurdu.
    await transaction.scheduledEventReminder.updateMany({
      data: { enabled: false },
      where: { eventId, userId },
    });
    await cancelEventReminderJobs(transaction, { eventId, userId });
  }

  return { delta: written.delta, scheduled: false };
}

/** `PUT /events/[eventId]/rsvp` — gövde **hedef durum** taşır, toggle değil. */
export async function setEventRsvp(
  userId: string,
  eventId: string,
  rsvp: EventRsvp | null,
  dependencies: EventMutationDependencies,
): Promise<EventWriteResponse> {
  const { database, now } = dependencies;
  const event = await requireVisibleEvent(database, eventId, userId);
  const eventNotificationsEnabled = await readEventNotificationsEnabled(database, userId);

  const { scheduled } = await database.$transaction((transaction) =>
    runEventRsvpTransaction(transaction as unknown as EventRsvpTransactionClient, {
      eventId,
      eventNotificationsEnabled,
      now,
      rsvp: toScheduledEventRsvpStatus(rsvp),
      startsAt: event.scheduledStartAt,
      userId,
    }),
  );

  return buildEventWriteResponse(dependencies, { eventId, scheduled, userId });
}

/**
 * `PUT /events/[eventId]/reminder` — `{ enabled, minutesBefore }`.
 *
 * Yanıt `scheduled` taşır: `availableAt` geçmişte kaldıysa iş yazılmaz (tuzak #8) ve panel
 * "etkinlik çok yakın" durumunu gösterebilir. `false` dönüp sessiz kalmak, kullanıcıya
 * gelmeyecek bir bildirimin sözünü vermek olurdu.
 */
export async function setEventReminder(
  userId: string,
  eventId: string,
  input: SetEventReminderInput,
  dependencies: EventMutationDependencies,
): Promise<EventWriteResponse> {
  const { database, now } = dependencies;
  const event = await requireVisibleEvent(database, eventId, userId);
  const eventNotificationsEnabled = await readEventNotificationsEnabled(database, userId);

  const scheduled = await database.$transaction(async (transaction) => {
    await transaction.scheduledEventReminder.upsert({
      create: {
        enabled: input.enabled,
        eventId,
        minutesBefore: input.minutesBefore,
        userId,
      },
      update: { enabled: input.enabled, minutesBefore: input.minutesBefore },
      where: { eventId_userId: { eventId, userId } },
    });

    const result = await scheduleEventReminderJob(transaction, {
      enabled: input.enabled,
      eventId,
      eventNotificationsEnabled,
      minutesBefore: input.minutesBefore,
      now,
      startsAt: event.scheduledStartAt,
      userId,
    });

    return result.scheduled;
  });

  return buildEventWriteResponse(dependencies, { eventId, scheduled, userId });
}

/* ------------------------------------------------------------------ oluşturma */

export type CreateEventServiceInput = {
  readonly channelId?: string | undefined;
  readonly durationMinutes: number;
  readonly externalLocation?: string | undefined;
  readonly isPublic: boolean;
  readonly kind: EventKind;
  readonly serverId: string;
  readonly startsAt: string;
  readonly title: string;
};

/**
 * `POST /api/v1/events`.
 *
 * Yetki `ensureEventPermission` (K4) — `ensureServerPermission(access, MANAGE_SERVER)` yazan
 * bir etkinlik yolu sapmadır: `MANAGE_EVENTS` yalnız etkinlik için dağıtılabilsin diye var.
 */
export async function createEvent(
  userId: string,
  input: CreateEventServiceInput,
  dependencies: EventMutationDependencies,
): Promise<EventWriteResponse> {
  const { database, now } = dependencies;

  const access = await getAccessContext(userId, input.serverId);
  ensureEventPermission(access);
  assertPublicEventAllowed(input.isPublic, access.type);

  const startsAt = new Date(input.startsAt);
  assertEventStartsInFuture(startsAt, now);

  let channelType: string | null = null;

  if (input.channelId) {
    const channel = await database.channel.findFirst({
      select: { type: true },
      where: { id: input.channelId, serverId: input.serverId },
    });

    if (!channel) {
      throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
    }

    channelType = channel.type;
    assertEventChannelMatchesKind(input.kind, channel.type);
  }

  const externalLocation = input.externalLocation ?? null;

  const created = await database.$transaction(async (transaction) => {
    const row = await transaction.scheduledEvent.create({
      data: {
        channelId: input.channelId ?? null,
        creatorId: userId,
        entityType: resolveEventEntityType({ channelType, externalLocation }),
        externalLocation,
        isPublic: input.isPublic,
        kind: toScheduledEventKind(input.kind),
        name: input.title,
        scheduledEndAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
        scheduledStartAt: startsAt,
        serverId: input.serverId,
      },
      select: { id: true },
    });

    /**
     * Fan-out **senkron yazılmaz**: 2.000 üyeli bir sunucuda oluşturma isteği bildirimlerin
     * altında kalırdı. İş, etkinliği yazan transaction'ın içinde kuyruğa giriyor — commit
     * olan bir etkinliğin bildirimi kaybolamaz.
     */
    await enqueueOutboxJob(transaction, {
      idempotencyKey: `scheduled-event-created:${row.id}`,
      payload: { eventId: row.id },
      type: OUTBOX_JOB_TYPES.scheduledEventCreatedNotifications,
    });

    return row;
  });

  return buildEventWriteResponse(dependencies, {
    eventId: created.id,
    scheduled: false,
    userId,
  });
}
