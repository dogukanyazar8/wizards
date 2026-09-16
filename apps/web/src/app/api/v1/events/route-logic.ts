import { prisma } from "@wizards/db";
import {
  CreateEventInputSchema,
  EventsListResponseSchema,
  type EventsListResponse,
} from "@wizards/types";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listEvents, type EventsListQuery } from "@/lib/events/events-service";
import { createEvent, type EventWriteResponse } from "@/lib/events/mutations";
import { publishEventCreated } from "@/lib/events/realtime";
import {
  parseEventDate,
  parseEventMineFilter,
  parseEventQuery,
  parseEventSource,
  parseEventTab,
  parseEventTimeFilter,
  parseEventWeekStart,
} from "@/lib/events/routes";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";

/**
 * `GET /api/v1/events` — Etkinlikler akışı (Dalga 1 / Ş1).
 *
 * Sekme, zaman, kaynak, katılım, arama ve hafta **sunucuda** uygulanır. Sayfalı bir listede
 * istemci süzgeci yalan söyler: "Canlı" o zaman "elinde kalan sayfadaki canlılar" demeye başlar
 * ve kullanıcı hiç görmediği kartların olmadığını sanar (K8, Bahsedilmeler'de ölçülen tuzak).
 *
 * Ayrıştırma `lib/events/routes.ts` üzerinden: adres çubuğunu okuyan ekran ile uç **aynı**
 * kuralları kullanır. İkinci bir ayrıştırıcı yazılsaydı `?tab=zzz` ekranda `all`, uçta 400
 * olurdu.
 */

const EventsQueryParamsSchema = z.object({
  date: z.string().optional(),
  cursor: z.string().min(1).max(400).optional(),
  // `0` bir hata değil, bir kip: kart istemeyen kabuk ipucu yalnız `counts` bloğunu okur.
  limit: z.coerce.number().int().min(0).max(50).default(24),
  mine: z.string().optional(),
  q: z.string().optional(),
  source: z.string().optional(),
  tab: z.string().optional(),
  time: z.string().optional(),
  week: z.string().optional(),
});

export type EventsRouteDependencies = HomeRouteContext & {
  listEvents: (userId: string, query: EventsListQuery) => Promise<EventsListResponse>;
};

export const defaultEventsDependencies: EventsRouteDependencies = {
  // Rota sözleşmesi korumayı rotanın kendi üzerinde görebilsin diye burada adlandırıldı
  // (`route-contract.test.ts`), çalıştırıcıdan devralınmadı.
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listEvents: (userId, query) => listEvents(userId, query, { database: prisma, now: new Date() }),
};

export async function eventsRoute(
  request: Request,
  dependencies: EventsRouteDependencies = defaultEventsDependencies,
) {
  return runHomeRoute(
    "events:list",
    dependencies,
    async (userId) => {
      const params = readSearchParams(request);
      const query = EventsQueryParamsSchema.parse({
        date: optionalParam(params, "date"),
        cursor: optionalParam(params, "cursor"),
        limit: optionalParam(params, "limit"),
        mine: optionalParam(params, "mine"),
        q: optionalParam(params, "q"),
        source: optionalParam(params, "source"),
        tab: optionalParam(params, "tab"),
        time: optionalParam(params, "time"),
        week: optionalParam(params, "week"),
      });
      const date = parseEventDate(query.date);

      return EventsListResponseSchema.parse(
        await dependencies.listEvents(userId, {
          cursor: query.cursor ?? null,
          date,
          limit: query.limit,
          mine: parseEventMineFilter(query.mine),
          query: parseEventQuery(query.q),
          serverId: parseEventSource(query.source),
          tab: parseEventTab(query.tab),
          time: date ? null : parseEventTimeFilter(query.time),
          weekStart: parseEventWeekStart(query.week),
        }),
      );
    },
    // Ş10 §6 — yanıt `Server-Timing` taşır. Izgara ve 300'lük ajanda rayı **ayrı** istekler
    // açıyor; sunucu işini (`db`) taşımadan bir gecikmenin hangi kolondan geldiği ölçülemez.
    request,
  );
}

/* ------------------------------------------------------------------ Ş3 · POST */

export type EventCreateRouteDependencies = HomeRouteContext & {
  publishCreated: typeof publishEventCreated;
  createEvent: (
    userId: string,
    input: z.infer<typeof CreateEventInputSchema>,
  ) => Promise<EventWriteResponse>;
  parseBody: typeof parseJsonBody;
};

export const defaultEventCreateDependencies: EventCreateRouteDependencies = {
  publishCreated: publishEventCreated,
  authenticate: () => requireApiUserId(),
  createEvent: (userId, input) =>
    createEvent(
      userId,
      {
        ...(input.channelId === undefined ? {} : { channelId: input.channelId }),
        ...(input.description === undefined ? {} : { description: input.description }),
        durationMinutes: input.durationMinutes,
        ...(input.externalLocation === undefined
          ? {}
          : { externalLocation: input.externalLocation }),
        isPublic: input.isPublic,
        kind: input.kind,
        serverId: input.serverId,
        startsAt: input.startsAt,
        title: input.title,
      },
      { database: prisma, now: new Date() },
    ),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

/**
 * `POST /api/v1/events` — Etkinlikler Ş3 §3.
 *
 * Yetki kapısı servis katmanında (`ensureEventPermission`, K4): rota yalnız gövdeyi
 * ayrıştırıyor. Yetki kontrolünü rotaya taşımak, aynı kuralın mobil ikizinde ikinci kez
 * yazılması demekti.
 *
 * `201` ile birlikte güncel sayaçlar da dönüyor; oluşturma sonrası ekranın ikinci bir
 * istekle sekme pillerini tazelemesi gerekmiyor.
 */
export async function eventCreateRoute(
  request: Request,
  dependencies: EventCreateRouteDependencies = defaultEventCreateDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "events:create");
    const input = await dependencies.parseBody(request, CreateEventInputSchema);

    const payload = await dependencies.createEvent(userId, input);
    dependencies.publishCreated({
      eventId: payload.event.id,
      serverId: payload.event.serverId,
      isPublic: payload.event.isPublic,
    });
    return Response.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
