import { prisma } from "@wizards/db";
import { SetEventRsvpSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { setEventRsvp, type EventWriteResponse } from "@/lib/events/mutations";
import type { HomeRouteContext } from "@/lib/home/route-runner";
import type { EventRsvp } from "@wizards/types";

/**
 * `PUT /api/v1/events/[eventId]/rsvp` — Etkinlikler Ş3 §2.
 *
 * Gövde **hedef durum** taşır (`{ "rsvp": "going" | "maybe" | null }`), toggle değil. İki
 * sekmede açık aynı ekran aynı butona bastığında "tersine çevir" semantiği sonucu isteklerin
 * sırasına bağlar; hedef durumda iki yarışan tık aynı yere yakınsar. `PUT` de bu yüzden:
 * istek idempotent.
 *
 * Yanıt güncel etkinliği **ve** sayaçları taşıyor — kart kenarı, buton metni, sağ ray listesi
 * ve başlık sayacı aynı anda tazeleniyor, istemci ikinci istek atmıyor.
 */
export type EventRsvpRouteDependencies = HomeRouteContext & {
  parseBody: typeof parseJsonBody;
  setRsvp: (userId: string, eventId: string, rsvp: EventRsvp | null) => Promise<EventWriteResponse>;
};

export const defaultEventRsvpDependencies: EventRsvpRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setRsvp: (userId, eventId, rsvp) =>
    setEventRsvp(userId, eventId, rsvp, { database: prisma, now: new Date() }),
};

export async function eventRsvpRoute(
  request: Request,
  eventId: string,
  dependencies: EventRsvpRouteDependencies = defaultEventRsvpDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "events:rsvp");
    const { rsvp } = await dependencies.parseBody(request, SetEventRsvpSchema);

    return Response.json(await dependencies.setRsvp(userId, eventId, rsvp), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
