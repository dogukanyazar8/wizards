import { prisma } from "@wizards/db";
import { SetEventReminderSchema, type SetEventReminderInput } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { setEventReminder, type EventWriteResponse } from "@/lib/events/mutations";
import type { HomeRouteContext } from "@/lib/home/route-runner";

/**
 * `PUT /api/v1/events/[eventId]/reminder` — Etkinlikler Ş3 §4 / K5.
 *
 * Yanıttaki `scheduled` bayrağı sözleşmenin parçası: `availableAt` geçmişte kaldıysa iş
 * **yazılmaz** (tuzak #8) ve panel "etkinlik çok yakın" durumunu gösterir. `true` dönüp iş
 * yazmamak ya da geçmiş bir işi kuyruğa koymak, ikisi de kullanıcıya gelmeyecek (ya da geç
 * gelecek) bir bildirimin sözünü vermek olurdu.
 */
export type EventReminderRouteDependencies = HomeRouteContext & {
  parseBody: typeof parseJsonBody;
  setReminder: (
    userId: string,
    eventId: string,
    input: SetEventReminderInput,
  ) => Promise<EventWriteResponse>;
};

export const defaultEventReminderDependencies: EventReminderRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setReminder: (userId, eventId, input) =>
    setEventReminder(userId, eventId, input, { database: prisma, now: new Date() }),
};

export async function eventReminderRoute(
  request: Request,
  eventId: string,
  dependencies: EventReminderRouteDependencies = defaultEventReminderDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "events:reminder");
    const input = await dependencies.parseBody(request, SetEventReminderSchema);

    return Response.json(await dependencies.setReminder(userId, eventId, input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
