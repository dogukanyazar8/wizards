import { prisma } from "@wizards/db";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { resolveAppOrigin } from "@/lib/app-origin";
import { requireApiUserId } from "@/lib/auth/api";
import { getEventDetail, type EventDetailResponse } from "@/lib/events/detail-service";
import { buildEventIcs, buildEventIcsFileName } from "@/lib/events/ics";
import { buildEventsHref } from "@/lib/events/routes";
import type { HomeRouteContext } from "@/lib/home/route-runner";

/**
 * `GET /api/v1/events/[eventId]/calendar.ics` — Etkinlikler Ş3 §5 / K7.
 *
 * `Takvime ekle` bir dosya indirir; harici takvim OAuth'u bu paketin dışında ve hiçbir
 * üçüncü tarafa veri gitmez. Erişim kuralı **detay ucunun kuralı**: görünürlük sorgunun
 * süzgeci, satır gelmezse 404.
 */
export type EventCalendarIcsRouteDependencies = HomeRouteContext & {
  loadEvent: (userId: string, eventId: string) => Promise<EventDetailResponse>;
  now: () => Date;
  resolveOrigin: () => URL | null;
};

export const defaultEventCalendarIcsDependencies: EventCalendarIcsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  loadEvent: (userId, eventId) =>
    getEventDetail(userId, eventId, {}, { database: prisma, now: new Date() }),
  now: () => new Date(),
  resolveOrigin: () => resolveAppOrigin(),
};

/** `<sunucu> › <kanal>`; harici etkinlikte `channelLabel` zaten bağlantı başlığını taşır. */
function toIcsLocation(event: EventDetailResponse): string {
  return event.channelLabel.length > 0
    ? `${event.serverName} › ${event.channelLabel}`
    : event.serverName;
}

/**
 * Ortam değişkeni yoksa göreli adres yazılır. Takvim uygulaması onu tıklanabilir yapmaz ama
 * dosyayı da reddetmez; `URL` satırını tamamen atmak, etkinliğin nereden geldiğini kaybetmek
 * olurdu.
 */
function toIcsUrl(origin: URL | null, eventId: string): string {
  const href = buildEventsHref({}, { panel: eventId });
  return origin ? new URL(href, origin).toString() : href;
}

export async function eventCalendarIcsRoute(
  _request: Request,
  eventId: string,
  dependencies: EventCalendarIcsRouteDependencies = defaultEventCalendarIcsDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "events:ics");
    const event = await dependencies.loadEvent(userId, eventId);

    const body = buildEventIcs({
      description: event.description,
      durationMinutes: event.durationMinutes,
      endsAt: event.endsAt ? new Date(event.endsAt) : null,
      id: event.id,
      location: toIcsLocation(event),
      now: dependencies.now(),
      startsAt: new Date(event.startsAt),
      title: event.title,
      url: toIcsUrl(dependencies.resolveOrigin(), event.id),
    });

    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${buildEventIcsFileName(event.title, event.id)}"`,
        "Content-Type": "text/calendar; charset=utf-8",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
