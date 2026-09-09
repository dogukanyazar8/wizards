import { type NotificationPrefs } from "@wizards/types";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";
import { patchNotificationPrefs, readNotificationPrefs } from "@/lib/notifications/prefs-service";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Ayarlar paketi — Dalga 1 / Ş1 §6. The one preference endpoint behind the seven Bildirimler
 * tabs and the 560 px window.
 *
 * `PATCH` answers the **whole** object rather than the patch it was given. Five preferences
 * appear on two tabs at once (tuzak #4), and a client merging a partial answer would leave the
 * other tab showing the value from a moment ago — the kind of drift that only ever surfaces as
 * "my setting didn't stick".
 *
 * The body is read as a plain object here and validated inside the service. Parsing it against
 * the strict patch schema first would turn `types.security` into an anonymous "unrecognized key"
 * 400, and the screen has to tell a locked row apart from a typo (tuzak #5).
 */

const NotificationPrefsRequestBodySchema = z.record(z.string(), z.unknown());

export type NotificationPrefsRouteDependencies = HomeRouteContext & {
  broadcast: (userId: string, patch: Record<string, unknown>) => void;
  patchPrefs: (userId: string, patch: Record<string, unknown>) => Promise<NotificationPrefs>;
  readPrefs: (userId: string) => Promise<NotificationPrefs>;
};

/**
 * §7 — `settings:updated`, `user:{userId}` room only.
 *
 * Ş0 already fixed this payload's shape in `packages/types` (`SettingsUpdatedEventSchema`:
 * `scope` + `patch`), so this lane uses that rather than the three-field shape its own prompt
 * sketched. One event, one schema; see sapma #S1.2.
 *
 * Emitted after the write and outside its transaction: a second tab re-reading on an event the
 * database has not committed yet renders the old row and stays there until something else moves.
 */
function broadcastNotificationPrefsUpdate(userId: string, patch: Record<string, unknown>): void {
  getSocketServer()
    ?.to(`user:${userId}`)
    .emit("settings:updated", { patch, scope: "notifications" });
}

export const defaultNotificationPrefsDependencies: NotificationPrefsRouteDependencies = {
  // Named here rather than reached through the runner so `route-contract.test.ts` can see the
  // guard on the route itself.
  authenticate: () => requireApiUserId(),
  broadcast: broadcastNotificationPrefsUpdate,
  enforceRateLimit: enforceApiRateLimit,
  patchPrefs: (userId, patch) => patchNotificationPrefs(userId, patch),
  readPrefs: (userId) => readNotificationPrefs(userId),
};

export function notificationPrefsGetRoute(
  request?: Request,
  dependencies: NotificationPrefsRouteDependencies = defaultNotificationPrefsDependencies,
): Promise<Response> {
  return runHomeRoute(
    "settings:notification-prefs",
    dependencies,
    (userId) => dependencies.readPrefs(userId),
    request,
  );
}

/**
 * Written out rather than run through `runHomeRoute`: `route-contract.test.ts` proves every
 * mutating route reads its body through `parseJsonBody`, and a parser handed to a shared runner
 * inside a closure is a parser nobody can prove.
 */
export async function notificationPrefsPatchRoute(
  request: Request,
  dependencies: NotificationPrefsRouteDependencies = defaultNotificationPrefsDependencies,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "settings:notification-prefs");
    const body = await parseJsonBody(request, NotificationPrefsRequestBodySchema);
    const prefs = await dependencies.patchPrefs(userId, body);

    dependencies.broadcast(userId, body);

    return Response.json(prefs, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
