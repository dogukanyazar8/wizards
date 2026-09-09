import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { getNotificationCounts } from "@/lib/notifications/service";
import { NotificationUnreadCountResponseSchema } from "@/lib/notifications/types";

/**
 * `GET /api/v1/notifications/unread-count` — zil noktasının ve sekme pillerinin kaynağı (Ş2 §5).
 *
 * Yanıt **hem** `count` **hem** `counts` taşır ve `count === counts.all`. Tek sayı bugünkü zil
 * menüsünün ve masaüstü tepsisinin sözleşmesi; onu düşürmek iki istemciyi aynı anda kırardı.
 * İkisi de aynı tek geçişli sorgudan okunuyor, yani ayrışamazlar.
 *
 * `counts.all > 0` ⇒ zil noktası. Nokta için ikinci bir sorgu yok.
 */
export type NotificationUnreadCountRouteDependencies = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
  getNotificationCounts: typeof getNotificationCounts;
};

export const defaultNotificationUnreadCountDependencies: NotificationUnreadCountRouteDependencies =
  {
    authenticate: () => requireApiUserId(),
    enforceRateLimit: enforceApiRateLimit,
    getNotificationCounts,
  };

export async function notificationUnreadCountRoute(
  dependencies: NotificationUnreadCountRouteDependencies = defaultNotificationUnreadCountDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "notification:unread-count");
    const counts = await dependencies.getNotificationCounts(userId);

    return Response.json(
      NotificationUnreadCountResponseSchema.parse({ count: counts.all, counts }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
