import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  EventDetailResponseSchema,
  getEventDetail,
  type EventDetailOptions,
  type EventDetailResponse,
} from "@/lib/events/detail-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";

/**
 * `GET /api/v1/events/[eventId]` — Ş2 §5. 326 px detay panelinin beslendiği tek uç.
 *
 * Görünürlük servisin sorgusunda yaşıyor; burada ikinci bir kontrol **yok**. Uç yalnız
 * kimliği çözer, `attendeeCursor`ı geçirir ve yanıtı şemadan geçirir — görmediği bir etkinlik
 * için servis 404 atar, 403 değil (403 etkinliğin varlığını sızdırır).
 */

export type EventDetailRouteDependencies = HomeRouteContext & {
  getEventDetail: (
    viewerId: string,
    eventId: string,
    options: EventDetailOptions,
  ) => Promise<EventDetailResponse>;
};

export const defaultEventDetailDependencies: EventDetailRouteDependencies = {
  // Named on the route rather than shared from the runner so the contract test
  // can see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  getEventDetail: (viewerId, eventId, options) =>
    getEventDetail(viewerId, eventId, options, { database: prisma, now: new Date() }),
};

/** Adres çubuğundan gelen değer kodlanmış olabilir; boş kimlik sorguya hiç gitmez. */
export function readEventId(raw: string): string {
  const eventId = decodeURIComponent(raw).trim();

  if (eventId.length === 0) {
    throw new ApiError("Invalid event id", 400, "EVENT_ID_INVALID");
  }

  return eventId;
}

export async function eventDetailRoute(
  request: Request,
  eventId: string,
  dependencies: EventDetailRouteDependencies = defaultEventDetailDependencies,
) {
  return runHomeRoute(
    "events:detail",
    dependencies,
    async (userId) => {
      const attendeeCursor = optionalParam(readSearchParams(request), "attendeeCursor") ?? null;

      return EventDetailResponseSchema.parse(
        await dependencies.getEventDetail(userId, readEventId(eventId), { attendeeCursor }),
      );
    },
    // Ş10 §6 — panel de kendi isteğini açıyor; aynı bucket dili.
    request,
  );
}
