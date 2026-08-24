import type { Prisma, PrismaClient } from "@wizards/db";
import {
  isValidIanaTimeZone,
  type EventDayBucket,
  type EventKind,
  type EventRsvp,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { buildChannelHref } from "@/lib/home/href";
import {
  EVENT_MANAGE_PERMISSIONS,
  PermissionBits,
  canUseLockedChannelPermission,
  hasAnyPermission,
  hasPermission,
  resolveChannelPermissions,
  resolveServerPermissions,
  type ChannelPermissionOverrideRecord,
} from "@/lib/workspace/permissions";
import { mergeRoleRecords } from "@/lib/workspace/role-helpers";

import {
  EVENT_ATTENDEE_PAGE_SIZE,
  compareEventAttendeeKeys,
  decodeEventAttendeeCursor,
  encodeEventAttendeeCursor,
  eventAttendeeKey,
  eventAttendeeRoleRank,
  resolveEventAttendees,
  toEventAttendeeName,
  toEventInitials,
  type EventAttendeeCandidate,
} from "./attendee-roles";
import {
  EventDetailResponseSchema as ResponseSchema,
  type EventDetailResponse,
} from "./detail-contract";

/**
 * Etkinlikler Ş2 — 326 px detay panelinin beslendiği tek okuma.
 *
 * Üç kural bu dosyanın şeklini belirliyor:
 *
 * 1. **Görünürlük sorgunun kendi süzgeci.** İzleyici sunucunun üyesiyse *veya* etkinlik
 *    `isPublic` ise satır gelir; gelmezse **404**. `403` etkinliğin var olduğunu söylerdi ve
 *    kapalı bir sunucunun etkinlik kimliği tahmin edilebilir bir sızıntı yüzeyi olurdu.
 * 2. **`SCHEDULED` etkinlikte `VoiceState` sorgusu hiç açılmaz.** Canlı dinleyici yalnız
 *    `ACTIVE` etkinlikte vardır; panel her açıldığında kanal başına bir sayım yapmak, hiç
 *    kimsenin oturmadığı bir odayı saymaktır.
 * 3. **Yanıt metin taşımaz.** `canJoinLive` / `joinHref` / `rsvp` döner, CTA metnini istemci
 *    i18n ile kurar (00-ortak-baglam §3.1).
 */

/* ------------------------------------------------------------- sözleşme */

/**
 * Şema `detail-contract.ts`te; sunucu ve istemci aynı dosyadan okur. Buradan yeniden ihraç
 * ediliyor ki uç ve testler tek modül adı bilsin.
 */
export { EventDetailResponseSchema, type EventDetailResponse } from "./detail-contract";

/* ------------------------------------------------------------ bağımlılık */

export type EventDetailDatabase = Pick<
  PrismaClient,
  "scheduledEvent" | "scheduledEventInterest" | "user" | "voiceState"
>;

export type EventDetailDependencies = {
  readonly database: EventDetailDatabase;
  readonly now: Date;
  /**
   * Tuzak #7 — kova kararı **tek yerde**, izleyicinin saat diliminde verilir. Hesap tercihi
   * yoksa isteğin taşıdığı bölge, o da yoksa varsayılan.
   */
  readonly requestTimeZone?: string | null;
};

export type EventDetailOptions = {
  readonly attendeeCursor?: string | null;
};

/** `lib/notifications/quiet-hours.ts` ile aynı varsayılan; ürünün ana kitlesi. */
export const DEFAULT_EVENTS_TIME_ZONE = "Europe/Istanbul";

/** `startsInMinutes` eşiği sunucuda uygulanır; istemci kuralı tekrar etmez. */
export const EVENT_STARTS_IN_THRESHOLD_MINUTES = 60;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/* --------------------------------------------------------------- projeksiyon */

type ScheduledEventKind = Prisma.ScheduledEventGetPayload<{ select: { kind: true } }>["kind"];
type ScheduledEventRsvpStatus = Prisma.ScheduledEventInterestGetPayload<{
  select: { status: true };
}>["status"];

const EVENT_KIND_BY_COLUMN = {
  COMMUNITY: "community",
  GAME: "game",
  LIVE: "live",
  MEETING: "meeting",
  VOICE: "voice",
  WORKSHOP: "workshop",
} as const satisfies Record<ScheduledEventKind, EventKind>;

const EVENT_RSVP_BY_COLUMN = {
  GOING: "going",
  MAYBE: "maybe",
} as const satisfies Record<ScheduledEventRsvpStatus, EventRsvp>;

/** `#kanal` yalnız yazışılan kanallarda; sesli ve sahne kanalları adlarıyla anılır. */
const HASH_PREFIXED_CHANNEL_TYPES = new Set(["ANNOUNCEMENT", "FORUM", "TEXT", "THREAD"]);

const VOICE_CHANNEL_TYPES = new Set(["STAGE", "VOICE"]);

export function resolveEventsTimeZone(
  accountPreference: string | null | undefined,
  requestTimeZone: string | null | undefined,
): string {
  if (accountPreference && accountPreference !== "AUTO" && isValidIanaTimeZone(accountPreference)) {
    return accountPreference;
  }

  return isValidIanaTimeZone(requestTimeZone) ? requestTimeZone : DEFAULT_EVENTS_TIME_ZONE;
}

/** İzleyicinin bölgesindeki takvim günü. `en-CA` zaten `YYYY-MM-DD` yazar. */
function calendarDateIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);
}

export function resolveEventDayBucket(startsAt: Date, now: Date, timeZone: string): EventDayBucket {
  const day = calendarDateIn(timeZone, startsAt);
  const today = calendarDateIn(timeZone, now);

  if (day < today) {
    return "past";
  }

  if (day === today) {
    return "today";
  }

  return day === calendarDateIn(timeZone, new Date(now.getTime() + DAY_MS)) ? "tomorrow" : "week";
}

function resolveDurationMinutes(startsAt: Date, endsAt: Date | null): number | null {
  if (!endsAt) {
    return null;
  }

  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / MINUTE_MS);
  return minutes > 0 ? minutes : null;
}

function resolveStartsInMinutes(startsAt: Date, now: Date): number | null {
  const minutes = Math.ceil((startsAt.getTime() - now.getTime()) / MINUTE_MS);
  return minutes >= 0 && minutes <= EVENT_STARTS_IN_THRESHOLD_MINUTES ? minutes : null;
}

/* ----------------------------------------------------------------- sorgu */

const CHANNEL_SELECT = {
  id: true,
  locked: true,
  name: true,
  permissionOverrides: {
    select: { allow: true, deny: true, targetId: true, targetType: true },
  },
  type: true,
} as const;

const ROLE_SELECT = {
  color: true,
  id: true,
  isDefault: true,
  name: true,
  permissions: true,
} as const;

const USER_SELECT = { avatarUrl: true, displayName: true, id: true, username: true } as const;

/**
 * İzleyiciye bağlı her şey **aynı gidiş dönüşte** gelir: üyelik, roller, kanal geçersiz
 * kılmaları, kendi RSVP'si ve kendi hatırlatması. Beşi ayrı sorgu olsaydı bir panel açılışı
 * altı tur atardı ve hepsi aynı satırı bekliyor olurdu.
 */
function eventSelectForViewer(viewerId: string) {
  return {
    channel: { select: CHANNEL_SELECT },
    channelId: true,
    creator: { select: USER_SELECT },
    creatorId: true,
    description: true,
    entityType: true,
    externalLocation: true,
    id: true,
    interestedCount: true,
    interests: { select: { status: true }, take: 1, where: { userId: viewerId } },
    isPublic: true,
    kind: true,
    maybeCount: true,
    name: true,
    recurrenceRule: true,
    reminders: {
      select: { enabled: true, minutesBefore: true },
      take: 1,
      where: { userId: viewerId },
    },
    scheduledEndAt: true,
    scheduledStartAt: true,
    server: {
      select: {
        id: true,
        members: {
          select: { id: true, roles: { select: { role: { select: ROLE_SELECT } } } },
          take: 1,
          where: { userId: viewerId },
        },
        name: true,
        ownerId: true,
        roles: { select: ROLE_SELECT, where: { isDefault: true } },
      },
    },
    serverId: true,
    status: true,
  } as const;
}

type EventDetailRow = Prisma.ScheduledEventGetPayload<{
  select: ReturnType<typeof eventSelectForViewer>;
}>;

/* --------------------------------------------------------------- katılımcı */

type InterestCandidateRow = {
  readonly createdAt: Date;
  readonly user: {
    readonly avatarUrl: string | null;
    readonly displayName: string | null;
    readonly id: string;
    readonly username: string;
  };
  readonly userId: string;
};

export async function getEventDetail(
  viewerId: string,
  eventId: string,
  options: EventDetailOptions,
  dependencies: EventDetailDependencies,
): Promise<EventDetailResponse> {
  const { database, now } = dependencies;

  // Görünürlük **sorgunun süzgeci**: satır gelmezse etkinlik bu izleyici için yoktur.
  const row = (await database.scheduledEvent.findFirst({
    select: eventSelectForViewer(viewerId),
    where: {
      OR: [{ server: { members: { some: { userId: viewerId } } } }, { isPublic: true }],
      id: eventId,
    },
  })) as EventDetailRow | null;

  if (!row) {
    throw new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND");
  }

  const viewer = await database.user.findUnique({
    select: {
      notificationSettings: { select: { eventNotifications: true } },
      settings: { select: { timeZone: true } },
    },
    where: { id: viewerId },
  });

  const timeZone = resolveEventsTimeZone(
    viewer?.settings?.timeZone ?? null,
    dependencies.requestTimeZone,
  );

  const isMember = (row.server?.members.length ?? 0) > 0;
  const roles = isMember
    ? mergeRoleRecords(
        row.server?.roles ?? [],
        (row.server?.members[0]?.roles ?? []).map((entry) => entry.role),
      )
    : [];

  const serverPermissions = isMember
    ? resolveServerPermissions({
        memberId: row.server?.members[0]?.id ?? null,
        ownerId: row.server?.ownerId ?? "",
        roles,
        userId: viewerId,
      })
    : 0n;

  const channelContext =
    isMember && row.channel
      ? {
          memberId: row.server?.members[0]?.id ?? null,
          overrides: row.channel.permissionOverrides as ChannelPermissionOverrideRecord[],
          ownerId: row.server?.ownerId ?? "",
          roles,
          userId: viewerId,
        }
      : null;

  const channelPermissions = channelContext ? resolveChannelPermissions(channelContext) : 0n;
  const canViewChannel =
    channelContext !== null && hasPermission(channelPermissions, PermissionBits.VIEW_CHANNEL);
  const needsVoice = VOICE_CHANNEL_TYPES.has(String(row.channel?.type ?? ""));
  const canConnectChannel =
    canViewChannel &&
    channelContext !== null &&
    (!needsVoice ||
      (hasPermission(channelPermissions, PermissionBits.CONNECT_VOICE) &&
        (!row.channel?.locked ||
          canUseLockedChannelPermission(channelContext, PermissionBits.CONNECT_VOICE))));

  const isLive = row.status === "ACTIVE";
  const cursor = decodeEventAttendeeCursor(options.attendeeCursor);

  /* --- rol adayları -------------------------------------------------- */

  const hostCandidate: EventAttendeeCandidate = {
    avatarUrl: row.creator.avatarUrl,
    displayName: row.creator.displayName,
    id: row.creator.id,
    role: "host",
    sortAt: row.scheduledStartAt,
    username: row.creator.username,
  };

  // Kural 2: `listening` yalnız `ACTIVE` etkinlikte hesaplanır — `SCHEDULED` etkinlikte bu
  // dal hiç açılmaz, sorgu da hiç kurulmaz.
  const listeningRows =
    isLive && row.channelId
      ? await database.voiceState.findMany({
          orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
          select: { joinedAt: true, user: { select: USER_SELECT } },
          where: { channelId: row.channelId },
        })
      : [];

  const listeningCandidates: EventAttendeeCandidate[] = listeningRows
    .filter((state) => state.user.id !== hostCandidate.id)
    .map((state) => ({
      avatarUrl: state.user.avatarUrl,
      displayName: state.user.displayName,
      id: state.user.id,
      role: "listening" as const,
      sortAt: state.joinedAt,
      username: state.user.username,
    }));

  // Sahip ve dinleyiciler zaten kendi satırlarında; RSVP dallarından **düşülürler** ki
  // aynı kişi ikinci kez sayılmasın ve sayfa sınırı kaymasın.
  const suppressedUserIds = [hostCandidate.id, ...listeningCandidates.map((entry) => entry.id)];

  const prefix = [hostCandidate, ...listeningCandidates].filter(
    (candidate) => !cursor || compareEventAttendeeKeys(eventAttendeeKey(candidate), cursor) > 0,
  );

  const [goingRemaining, maybeRemaining] = await Promise.all([
    database.scheduledEventInterest.count({
      where: interestWhere(eventId, "GOING", suppressedUserIds, cursor),
    }),
    database.scheduledEventInterest.count({
      where: interestWhere(eventId, "MAYBE", suppressedUserIds, cursor),
    }),
  ]);

  const candidates: EventAttendeeCandidate[] = [...prefix.slice(0, EVENT_ATTENDEE_PAGE_SIZE)];

  for (const status of ["GOING", "MAYBE"] as const) {
    const need = EVENT_ATTENDEE_PAGE_SIZE - candidates.length;
    if (need <= 0) {
      break;
    }

    const rows = (await database.scheduledEventInterest.findMany({
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
      select: { createdAt: true, user: { select: USER_SELECT }, userId: true },
      take: need,
      where: interestWhere(eventId, status, suppressedUserIds, cursor),
    })) as InterestCandidateRow[];

    for (const interest of rows) {
      candidates.push({
        avatarUrl: interest.user.avatarUrl,
        displayName: interest.user.displayName,
        id: interest.user.id,
        role: status === "GOING" ? "going" : "maybe",
        sortAt: interest.createdAt,
        username: interest.user.username,
      });
    }
  }

  const attendees = resolveEventAttendees(candidates);
  const remaining = prefix.length + goingRemaining + maybeRemaining;
  const last = candidates.at(-1);
  const attendeeMoreCount = Math.max(0, remaining - attendees.length);

  /* --- yanıt --------------------------------------------------------- */

  const rsvp = row.interests[0]?.status ? EVENT_RSVP_BY_COLUMN[row.interests[0].status] : null;
  const reminderRow = row.reminders[0] ?? null;
  const joinHref =
    row.channelId && canViewChannel ? buildChannelHref(row.serverId, row.channelId) : null;

  return ResponseSchema.parse({
    attendeeMoreCount,
    attendeeNextCursor:
      attendeeMoreCount > 0 && last ? encodeEventAttendeeCursor(eventAttendeeKey(last)) : null,
    attendeePreview: attendees.slice(0, 3),
    attendees,
    canJoinLive: isLive && row.channelId !== null && canConnectChannel,
    channelId: row.channelId,
    channelLabel: resolveChannelLabel(row),
    dayBucket: resolveEventDayBucket(row.scheduledStartAt, now, timeZone),
    description: row.description ?? "",
    durationMinutes: resolveDurationMinutes(row.scheduledStartAt, row.scheduledEndAt),
    endsAt: row.scheduledEndAt?.toISOString() ?? null,
    goingCount: Math.max(0, row.interestedCount),
    // Baş harfler listedeki satırdan **okunmaz**: ikinci katılımcı sayfasında sahip listede
    // olmaz ve bilgi kartındaki avatar harfsiz kalırdı.
    host: {
      avatarUrl: row.creator.avatarUrl,
      id: row.creator.id,
      initials: toEventInitials(toEventAttendeeName(row.creator)),
      name: toEventAttendeeName(row.creator),
    },
    id: row.id,
    isLive,
    isPublic: row.isPublic,
    joinHref,
    kind: EVENT_KIND_BY_COLUMN[row.kind],
    maybeCount: Math.max(0, row.maybeCount),
    recurrenceRule: row.recurrenceRule,
    reminder: reminderRow
      ? { enabled: reminderRow.enabled, minutesBefore: reminderRow.minutesBefore }
      : null,
    reminderSuppressed: viewer?.notificationSettings?.eventNotifications === false,
    rsvp,
    serverId: row.serverId,
    serverName: row.server?.name ?? "",
    startsAt: row.scheduledStartAt.toISOString(),
    startsInMinutes: resolveStartsInMinutes(row.scheduledStartAt, now),
    title: row.name,
    viewerCanManage: isMember && hasAnyPermission(serverPermissions, [...EVENT_MANAGE_PERMISSIONS]),
    viewerIsMember: isMember,
  });
}

function interestWhere(
  eventId: string,
  status: ScheduledEventRsvpStatus,
  suppressedUserIds: readonly string[],
  cursor: { id: string; rank: number; sortAt: string } | null,
) {
  const rank = eventAttendeeRoleRank(status === "GOING" ? "going" : "maybe");
  const keyset = cursor && cursor.rank === rank ? new Date(cursor.sortAt) : null;

  return {
    eventId,
    status,
    ...(suppressedUserIds.length > 0 ? { userId: { notIn: [...suppressedUserIds] } } : {}),
    ...(keyset && cursor
      ? {
          OR: [{ createdAt: { gt: keyset } }, { createdAt: keyset, userId: { gt: cursor.id } }],
        }
      : {}),
  };
}

function resolveChannelLabel(row: EventDetailRow): string {
  if (!row.channel) {
    return row.externalLocation ?? "";
  }

  return HASH_PREFIXED_CHANNEL_TYPES.has(String(row.channel.type))
    ? `#${row.channel.name}`
    : row.channel.name;
}
