import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";
import {
  listNotificationExceptions,
  type NotificationExceptionList,
} from "@/lib/notifications/exceptions-service";

/**
 * `GET /api/v1/users/me/notification-exceptions` — Bildirimler › İstisnalar sekmesinin listesi.
 *
 * K4: tek okuma ucu, üç kaynak, **sıfır** yeni tablo. Yazma buraya gelmez; her satır kendi
 * ucuna gider (`lib/settings/exceptions-client.ts`), bu yüzden burada yalnız `GET` var.
 *
 * `Yüzeyler` sekmesindeki `Aktif istisna` sayısı bu listenin uzunluğudur — ikinci bir sayaç
 * ucu açılırsa iki rakam birbirinden ayrışır ve hangisinin doğru olduğu sorulur.
 *
 * Sayfalama yok (§3): istisna sayısı doğası gereği küçük. 200'ün üstü kesilir ve `truncated`
 * ile bildirilir.
 */

export type NotificationExceptionsRouteDependencies = HomeRouteContext & {
  listExceptions: (userId: string) => Promise<NotificationExceptionList>;
};

export const defaultNotificationExceptionsDependencies: NotificationExceptionsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listExceptions: (userId) => listNotificationExceptions(userId, { database: prisma }),
};

export async function notificationExceptionsRoute(
  dependencies: NotificationExceptionsRouteDependencies = defaultNotificationExceptionsDependencies,
) {
  return runHomeRoute("notification:list", dependencies, (userId) =>
    dependencies.listExceptions(userId),
  );
}
