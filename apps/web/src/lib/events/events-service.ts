import { prisma, type PrismaClient } from "@wizards/db";
import {
  EVENT_REMINDER_DEFAULT_MINUTES,
  normalizeServerIconTone,
  type EventAttendee,
  type EventCounts,
  type EventDayBucket,
  type EventKind,
  type EventMineFilter,
  type EventRsvp,
  type EventTab,
  type EventTimeFilter,
  type EventWeekDay,
  type EventsListResponse,
  type WhisprEvent,
} from "@wizards/types";
import { resolveAccountTimeZone } from "@wizards/types";

import {
  EMPTY_EVENTS_COUNTS_ROW,
  addZonedDays,
  buildEventsAttendeePreviewQuery,
  buildEventsCountsQuery,
  buildEventsPageQuery,
  buildEventsWeekQuery,
  decodeEventsCursor,
  encodeEventsCursor,
  resolveEventsOrderDirection,
  zonedCalendarDate,
  zonedDayStart,
  type EventsAttendeeRow,
  type EventsCountsRow,
  type EventsQueryRow,
  type EventsQueryScope,
  type EventsWeekRow,
} from "@/lib/events/events-query";
import { listViewerServerIds } from "@/lib/home/service";
import { toInitials } from "@/lib/messages/rail-presentation";
import {
  EVENT_MANAGE_PERMISSIONS,
  hasAnyPermission,
  resolveServerPermissions,
} from "@/lib/workspace/permissions";
import { mergeRoleRecords } from "@/lib/workspace/role-helpers";

/**
 * Etkinlikler — Dalga 1 / Ş1. `GET /api/v1/events` gövdesi.
 *
 * Sorgu `events-query.ts`te; burada üç şey var: satırı karta çevirmek, **gün kovasını
 * izleyicinin saat diliminde kararlaştırmak** ve hafta şeridinin yedi kutusunu kurmak.
 *
 * Kova kararının burada olması bir sözleşme, bir tercih değil (tuzak #7): istemci de kova
 * hesaplasaydı gece yarısına yakın bir etkinlik iki tarafta iki farklı güne düşer ve gruplar
 * arasında kaybolurdu. Sunucu UTC ISO gönderir, kovayı **kendisi** söyler; `presentation.ts`
 * yalnız o kovanın metnini kurar.
 */

/** SPEC §3.2 — nokta satırı en çok dört tür taşır. */
export const EVENTS_WEEK_KIND_LIMIT = 4;

/** Hafta şeridi yedi gün; boş gün de bir kutudur. */
export const EVENTS_WEEK_DAYS = 7;

/**
 * `startsInMinutes` eşiği. Eşik **sunucudadır**: istemci "60'tan küçükse yaz" kuralını tekrar
 * etmez, iki yerde yaşayan bir eşik bir gün ayrışır.
 */
export const EVENTS_STARTS_IN_THRESHOLD_MINUTES = 60;

const MS_PER_MINUTE = 60_000;

const DEFAULT_TIME_ZONE = "Europe/Istanbul";

// ---------------------------------------------------------------------------
// Bağımlılıklar
// ---------------------------------------------------------------------------

/**
 * K4 — `MANAGE_EVENTS` taşınan sunucular. Arayüz enjekte ediliyor çünkü yetki çözümü izin
 * katmanının işi; okuma servisinin rol maskesi hakkında ikinci bir görüşü olmamalı.
 */
export type EventsManageResolver = (
  userId: string,
  serverIds: readonly string[],
) => Promise<ReadonlySet<string>>;

/** İzleyicinin hesap saat dilimi; yoksa `Europe/Istanbul`. */
export type EventsTimeZoneReader = (userId: string) => Promise<string>;

export type EventsDependencies = {
  readonly database: PrismaClient;
  readonly now: Date;
  readonly readManageableServerIds?: EventsManageResolver;
  readonly readViewerTimeZone?: EventsTimeZoneReader;
};

export type EventsListQuery = {
  readonly date?: string | null | undefined;
  readonly cursor?: string | null | undefined;
  readonly limit: number;
  readonly mine?: EventMineFilter | null | undefined;
  readonly query?: string | null | undefined;
  readonly serverId?: string | null | undefined;
  readonly tab: EventTab;
  readonly time?: EventTimeFilter | null | undefined;
  readonly weekStart?: string | null | undefined;
};

/**
 * Rol maskesi okuması: yalnız sayfadaki **üye olunan** sunucular için. Üye olunmayan bir
 * sunucunun herkese açık etkinliğinde yetki sorusu sorulmaz — cevabı zaten "hayır".
 */
export const defaultEventsManageResolver: EventsManageResolver = async (userId, serverIds) => {
  if (serverIds.length === 0) {
    return new Set<string>();
  }

  const memberships = await prisma.serverMember.findMany({
    select: {
      roles: {
        select: {
          role: {
            select: { color: true, id: true, isDefault: true, name: true, permissions: true },
          },
        },
      },
      server: {
        select: {
          id: true,
          ownerId: true,
          roles: {
            select: { color: true, id: true, isDefault: true, name: true, permissions: true },
            where: { isDefault: true },
          },
        },
      },
    },
    where: { serverId: { in: [...serverIds] }, userId },
  });

  const manageable = new Set<string>();

  for (const membership of memberships) {
    const roles = mergeRoleRecords(
      membership.server.roles,
      membership.roles.map((entry) => entry.role),
    );
    const permissions = resolveServerPermissions({
      ownerId: membership.server.ownerId,
      roles,
      userId,
    });

    if (hasAnyPermission(permissions, [...EVENT_MANAGE_PERMISSIONS])) {
      manageable.add(membership.server.id);
    }
  }

  return manageable;
};

export const defaultEventsTimeZoneReader: EventsTimeZoneReader = async (userId) => {
  const settings = await prisma.userSettings.findUnique({
    select: { timeZone: true },
    where: { userId },
  });

  return resolveEventsTimeZone(settings?.timeZone);
};

/**
 * Hesap tercihi → istek başlığı → `Europe/Istanbul`. `resolveAccountTimeZone` tanımadığı bir
 * bölgeyi `UTC`ye düşürür; burada onun yerine ürünün varsayılanı geçer, çünkü `UTC` hiçbir
 * kullanıcının takvimi değil.
 */
export function resolveEventsTimeZone(
  preference: string | null | undefined,
  fallback: string | null | undefined = DEFAULT_TIME_ZONE,
): string {
  for (const candidate of [preference, fallback]) {
    const trimmed = candidate?.trim();
    if (trimmed && resolveAccountTimeZone(trimmed, null) === trimmed) {
      return trimmed;
    }
  }

  return DEFAULT_TIME_ZONE;
}

// ---------------------------------------------------------------------------
// Projeksiyon
// ---------------------------------------------------------------------------

const KIND_BY_ENUM: Readonly<Record<string, EventKind>> = {
  COMMUNITY: "community",
  GAME: "game",
  LIVE: "live",
  MEETING: "meeting",
  VOICE: "voice",
  WORKSHOP: "workshop",
};

const RSVP_BY_ENUM: Readonly<Record<string, EventRsvp>> = {
  GOING: "going",
  MAYBE: "maybe",
};

/** Metin benzeri kanallar `#` taşır; sesli ve sahne kanalları kendi adlarıyla yazılır. */
const HASH_PREFIXED_CHANNEL_TYPES = new Set(["ANNOUNCEMENT", "FORUM", "TEXT", "THREAD"]);

export function toEventKind(value: string): EventKind {
  return KIND_BY_ENUM[value] ?? "meeting";
}

/**
 * SPEC §3.6 "kaynak › kanal" satırının sağ yarısı.
 *
 * Sunucudaki **verinin kendisi** yazılır — kanal başlığı ya da harici bağlantı. `Sahne · sesli
 * oda` gibi bir tanım cümlesi burada üretilmez: o cümle çevrilecek bir metindir ve sunucudan
 * gönderilseydi `en` sözlüğü hiçbir zaman doğru olamazdı (00-ortak-baglam §3.1).
 */
export function toChannelLabel(row: {
  readonly channelName: string | null;
  readonly channelType: string | null;
  readonly externalLocation: string | null;
}): string {
  if (!row.channelName) {
    return row.externalLocation ?? "";
  }

  return HASH_PREFIXED_CHANNEL_TYPES.has(row.channelType ?? "")
    ? `#${row.channelName}`
    : row.channelName;
}

/**
 * Kova **takvim gününe** göre verilir, "şimdi"ye göre değil: bugün 09:00'da başlamış canlı bir
 * etkinlik saat 15:00'te hâlâ `Bugün` grubundadır. `Geçmiş` yalnız dünden geriye düşer.
 */
export function toDayBucket(startsAt: Date, now: Date, timeZone: string): EventDayBucket {
  const eventDate = zonedCalendarDate(startsAt, timeZone);
  const today = zonedCalendarDate(now, timeZone);

  if (eventDate === today) {
    return "today";
  }

  if (eventDate < today) {
    return "past";
  }

  return eventDate === addZonedDays(today, 1) ? "tomorrow" : "week";
}

export function toStartsInMinutes(startsAt: Date, now: Date): number | null {
  const minutes = (startsAt.getTime() - now.getTime()) / MS_PER_MINUTE;

  if (minutes < 0 || minutes > EVENTS_STARTS_IN_THRESHOLD_MINUTES) {
    return null;
  }

  return Math.round(minutes);
}

function toDurationMinutes(startsAt: Date, endsAt: Date | null): number | null {
  if (!endsAt) {
    return null;
  }

  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / MS_PER_MINUTE);
  return minutes > 0 ? minutes : null;
}

function toAttendee(row: EventsAttendeeRow, hostId: string): EventAttendee {
  const name = row.displayName ?? row.username;

  return {
    avatarUrl: row.avatarUrl,
    id: row.id,
    initials: toInitials(name),
    name,
    role: row.id === hostId ? "host" : "going",
  };
}

function toWhisprEvent(
  row: EventsQueryRow,
  input: {
    readonly attendees: readonly EventsAttendeeRow[];
    readonly manageableServerIds: ReadonlySet<string>;
    readonly now: Date;
    readonly timeZone: string;
  },
): WhisprEvent {
  const hostName = row.hostDisplayName ?? row.hostUsername;

  return {
    attendeePreview: input.attendees.map((attendee) => toAttendee(attendee, row.hostId)),
    channelId: row.channelId,
    channelLabel: toChannelLabel(row),
    dayBucket: toDayBucket(row.startsAt, input.now, input.timeZone),
    description: row.description,
    durationMinutes: toDurationMinutes(row.startsAt, row.endsAt),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    // K1 — `interestedCount`un yeni anlamı: **going**. İşlemsel sayaç okunuyor, ikinci bir
    // `COUNT` değil: satır zaten biliyor ve önizleme uzunluğu bu sayıyı belirlemez.
    goingCount: Math.max(0, row.goingCount),
    host: {
      avatarUrl: row.hostAvatarUrl,
      id: row.hostId,
      initials: toInitials(hostName),
      name: hostName,
    },
    id: row.id,
    isLive: row.status === "ACTIVE",
    isPublic: row.isPublic,
    kind: toEventKind(row.kind),
    maybeCount: Math.max(0, row.maybeCount),
    recurrenceRule: row.recurrenceRule,
    reminder:
      row.reminderEnabled === null
        ? null
        : {
            enabled: row.reminderEnabled,
            minutesBefore: row.reminderMinutesBefore ?? EVENT_REMINDER_DEFAULT_MINUTES,
          },
    rsvp: row.rsvp ? (RSVP_BY_ENUM[row.rsvp] ?? null) : null,
    serverId: row.serverId,
    serverIconColor: normalizeServerIconTone(row.serverIconColor),
    serverIconUrl: row.serverIconUrl,
    serverName: row.serverName,
    serverShortName: row.serverShortName,
    startsAt: row.startsAt.toISOString(),
    startsInMinutes: toStartsInMinutes(row.startsAt, input.now),
    title: row.title,
    viewerCanManage: input.manageableServerIds.has(row.serverId),
    viewerIsMember: row.viewerIsMember,
  };
}

function toCounts(row: EventsCountsRow | undefined): EventCounts {
  const counts = row ?? EMPTY_EVENTS_COUNTS_ROW;

  return {
    all: counts.all,
    going: counts.going,
    live: counts.live,
    // Gezinme panelindeki 6 px `--danger` noktası bunu okur; sayfadaki kartlardan değil,
    // sayaçtan — filtreli bir sayfada canlı etkinlik görünmeyebilir ama yine de vardır.
    liveNow: counts.live > 0,
    nextStartsAt: counts.nextStartsAt ? counts.nextStartsAt.toISOString() : null,
    upcoming: counts.upcoming,
  };
}

/**
 * SPEC §3.2 — yedi kutu. Günün noktaları o günün **türlerinden** gelir: aynı türden beş etkinlik
 * beş özdeş nokta değil, bir nokta çizer; `count` toplamı yine de tam sayıyı taşır.
 */
function toWeek(
  rows: readonly EventsWeekRow[],
  input: { readonly now: Date; readonly timeZone: string; readonly weekStart: string },
): EventWeekDay[] {
  const today = zonedCalendarDate(input.now, input.timeZone);
  const byDate = new Map<string, EventsWeekRow[]>();

  for (const row of rows) {
    const bucket = byDate.get(row.date) ?? [];
    bucket.push(row);
    byDate.set(row.date, bucket);
  }

  return Array.from({ length: EVENTS_WEEK_DAYS }, (_value, index) => {
    const date = addZonedDays(input.weekStart, index);
    const dayRows = [...(byDate.get(date) ?? [])].sort(
      (left, right) => left.firstStartAt.getTime() - right.firstStartAt.getTime(),
    );

    return {
      count: dayRows.reduce((total, row) => total + row.count, 0),
      isToday: date === today,
      kinds: dayRows.slice(0, EVENTS_WEEK_KIND_LIMIT).map((row) => toEventKind(row.kind)),
      date,
    } satisfies EventWeekDay;
  });
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

export async function listEvents(
  userId: string,
  query: EventsListQuery,
  dependencies: EventsDependencies,
): Promise<EventsListResponse> {
  const { database, now } = dependencies;
  const readManageableServerIds =
    dependencies.readManageableServerIds ?? defaultEventsManageResolver;
  const readViewerTimeZone = dependencies.readViewerTimeZone ?? defaultEventsTimeZoneReader;

  const [viewerServerIds, timeZone] = await Promise.all([
    listViewerServerIds(database, userId),
    readViewerTimeZone(userId),
  ]);

  const weekStart = query.weekStart ?? mondayOfZonedToday(now, timeZone);

  const scope: EventsQueryScope = {
    date: query.date ?? null,
    mine: query.mine ?? null,
    now,
    query: query.query ?? null,
    serverId: query.serverId ?? null,
    tab: query.tab,
    time: query.time ?? null,
    timeZone,
    userId,
    viewerServerIds,
    weekStart,
  };

  const cursor = decodeEventsCursor(query.cursor);
  const weekRange = {
    from: zonedDayStart(weekStart, timeZone),
    to: zonedDayStart(addZonedDays(weekStart, EVENTS_WEEK_DAYS), timeZone),
  };

  /**
   * `limit = 0` **yalnız sayaçlar** kipidir: gezinme panelindeki saat ipucu (Ş4) her rotada
   * çiziliyor ve `/events` dışında ne karta ne hafta şeridine bakıyor. Aynı uç, aynı görünürlük
   * dalları, tek sorgu — ikinci bir sayaç ucu açmak yerine bu ucun ucuz kipi.
   */
  const countsOnly = query.limit <= 0;

  // Üç okuma birbirinden bağımsız: sayfa, sayaçlar ve hafta noktaları. Sırayla beklemek üç
  // gidiş-dönüşü arka arkaya dizerdi ve hiçbiri diğerinin sonucunu kullanmıyor.
  const [rows, countsRows, weekRows] = await Promise.all([
    countsOnly
      ? Promise.resolve<EventsQueryRow[]>([])
      : database.$queryRaw<EventsQueryRow[]>(buildEventsPageQuery(scope, cursor, query.limit)),
    database.$queryRaw<EventsCountsRow[]>(buildEventsCountsQuery(scope)),
    countsOnly
      ? Promise.resolve<EventsWeekRow[]>([])
      : database.$queryRaw<EventsWeekRow[]>(buildEventsWeekQuery(scope, weekRange)),
  ]);

  const page = rows.slice(0, query.limit);
  const attendeeQuery = buildEventsAttendeePreviewQuery(page.map((row) => row.id));
  const attendees = attendeeQuery
    ? await database.$queryRaw<EventsAttendeeRow[]>(attendeeQuery)
    : [];

  // Yetki yalnız **üye olunan** sunucular için sorulur; herkese açık bir etkinliğin sahibi
  // olmayan izleyicinin rol maskesi zaten yok.
  const manageableServerIds = await readManageableServerIds(userId, [
    ...new Set(page.filter((row) => row.viewerIsMember).map((row) => row.serverId)),
  ]);

  const attendeesByEventId = new Map<string, EventsAttendeeRow[]>();
  for (const attendee of attendees) {
    const bucket = attendeesByEventId.get(attendee.eventId) ?? [];
    bucket.push(attendee);
    attendeesByEventId.set(attendee.eventId, bucket);
  }

  const last = page.at(-1);
  const hasMore = rows.length > query.limit;

  return {
    counts: toCounts(countsRows[0]),
    items: page.map((row) =>
      toWhisprEvent(row, {
        attendees: attendeesByEventId.get(row.id) ?? [],
        manageableServerIds,
        now,
        timeZone,
      }),
    ),
    nextCursor:
      hasMore && last
        ? encodeEventsCursor({
            direction: resolveEventsOrderDirection(scope.time),
            id: last.id,
            startAt: last.startsAt,
          })
        : null,
    // Sorulmayan hafta **boş** döner, yedi boş kutu değil: yedi boş kutu "bu hafta hiç etkinlik
    // yok" demektir ve sayaç kipinde bu soru hiç sorulmadı.
    week: countsOnly ? [] : toWeek(weekRows, { now, timeZone, weekStart }),
  };
}

/** İzleyicinin takvimindeki bu haftanın pazartesisi (K9). */
export function mondayOfZonedToday(now: Date, timeZone: string): string {
  const today = zonedCalendarDate(now, timeZone);
  // `getUTCDay()` pazarı 0 sayar; ISO haftası pazartesi başlar, o yüzden pazar 6 gün geriye.
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();

  return addZonedDays(today, -((weekday + 6) % 7));
}
