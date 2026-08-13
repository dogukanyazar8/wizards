import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { clearNotifications } from "@/lib/notifications/service";

export type NotificationsClearRouteDependencies = {
  authenticate: () => Promise<string>;
  clearNotifications: typeof clearNotifications;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
};

const defaultDependencies: NotificationsClearRouteDependencies = {
  authenticate: requireApiUserId,
  clearNotifications,
  enforceRateLimit: enforceApiRateLimit,
};

export async function notificationsClearRoute(
  dependencies: NotificationsClearRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "notification:clear");
    // Both web and mobile must retire counters through the same service. A
    // direct delete strands badges after their notification rows disappear.
    await dependencies.clearNotifications(userId);

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
