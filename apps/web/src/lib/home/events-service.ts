import type { PrismaClient } from "@wizards/db";

import { buildEventHref } from "@/lib/home/href";
import {
  HOME_ACTOR_SELECT,
  listViewerServerIds,
  toHomeActor,
  type HomePresenceReader,
} from "@/lib/home/service";
import type { EventsUpcomingResponse, HomeEventSummary } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §3.5, "Sıradaki" kartı.
 *
 * Kapsam izleyicinin **üye olduğu** sunucuların etkinlikleri; üye olunmayan bir sunucunun
 * etkinliği görünemez, çünkü sunucu kimliği listesi sorgunun kendi süzgeci — sonuca uygulanan
 * bir kontrol değil.
 *
 * Sıralı okuma `ScheduledEvent(serverId, status, scheduledStartAt)` indeksinden gelir.
 *
 * Ş10 — Faz 6'nın `listHomeEvents` / `getHomeEventCalendar` okumaları **silindi**: eski
 * `/events` liste + ay takvimi ekranı kalktı, akışın tek okuması `lib/events/events-service.ts`.
 * Bu dosyada geriye yalnız "Sıradaki" kartı kaldı.
 */

export const HOME_EVENT_ATTENDEE_LIMIT = 3;

/**
 * K1 — sayaç ile önizleme aynı kümeyi okur. Tek yerde durur ki ham SQL ile Prisma sorgusu
 * bir gün ayrışamasın.
 */
const HOME_EVENT_ATTENDEE_STATUS = "GOING" as const;

const EVENT_SELECT = {
  channel: { select: { id: true, name: true } },
  id: true,
  interestedCount: true,
  name: true,
  scheduledStartAt: true,
  server: { select: { id: true, name: true } },
  serverId: true,
} as const;

type EventRow = {
  readonly channel: { readonly id: string; readonly name: string } | null;
  readonly id: string;
  readonly interestedCount: number;
  readonly name: string;
  readonly scheduledStartAt: Date;
  readonly server: { readonly id: string; readonly name: string } | null;
  readonly serverId: string;
};

function toContext(row: EventRow): string {
  const serverName = row.server?.name ?? "";
  return row.channel ? `${serverName} · ${row.channel.name}` : serverName;
}

function toSummary(row: EventRow): HomeEventSummary {
  return {
    context: toContext(row),
    id: row.id,
    startAt: row.scheduledStartAt.toISOString(),
    title: row.name,
  };
}

export type HomeEventsDependencies = {
  readonly database: PrismaClient;
  readonly now: Date;
  readonly readPresence: HomePresenceReader;
};

export async function getHomeUpcomingEvents(
  userId: string,
  limit: number,
  dependencies: HomeEventsDependencies,
): Promise<EventsUpcomingResponse> {
  const { database, now, readPresence } = dependencies;
  const serverIds = await listViewerServerIds(database, userId);

  if (serverIds.length === 0) {
    return { next: null, totalCount: 0, upcoming: [] };
  }

  const where = {
    scheduledStartAt: { gte: now },
    serverId: { in: serverIds },
    status: "SCHEDULED" as const,
  };

  const [rows, totalCount] = await Promise.all([
    database.scheduledEvent.findMany({
      orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
      select: {
        ...EVENT_SELECT,
        // The viewer's own interest rides along as a bounded sub-select instead
        // of a second query per event.
        interests: { select: { id: true }, take: 1, where: { userId } },
      },
      // One for the hero row, `limit` for the list underneath it.
      take: 1 + limit,
      where,
    }),
    database.scheduledEvent.count({ where }),
  ]);

  const [next, ...upcoming] = rows;

  if (!next) {
    return { next: null, totalCount, upcoming: [] };
  }

  const interests = await database.scheduledEventInterest.findMany({
    orderBy: { createdAt: "asc" },
    select: { user: { select: HOME_ACTOR_SELECT } },
    take: HOME_EVENT_ATTENDEE_LIMIT,
    // K1 — `interestedCount` artık yalnız `GOING` sayıyor, dolayısıyla yanındaki avatar
    // şeridi de öyle süzülür. Süzülmezse kart "3 kişi katılıyor" yazıp yanına katılmayan
    // birini çizer (`count-contract.test.ts`).
    where: { eventId: next.id, status: HOME_EVENT_ATTENDEE_STATUS },
  });

  const presenceByUserId = await readPresence(
    userId,
    interests.map((interest) => interest.user.id),
  );

  return {
    next: {
      ...toSummary(next),
      // The transactional counter, not a second COUNT: the row already knows.
      attendeeCount: Math.max(0, next.interestedCount),
      attendees: interests.map((interest) => toHomeActor(interest.user, presenceByUserId)),
      href: buildEventHref(next.serverId, next.id),
      interested: next.interests.length > 0,
      serverId: next.serverId,
    },
    totalCount,
    upcoming: upcoming.map(toSummary),
  };
}
