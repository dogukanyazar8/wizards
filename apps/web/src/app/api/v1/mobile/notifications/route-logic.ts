import {
  MobileNotificationIdParamsSchema,
  MobileNotificationMutationResponseSchema,
  MobileNotificationsQuerySchema,
  MobileNotificationsResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listMobileNotifications, markAllRead, markRead } from "@/lib/notifications/service";

export type MobileNotificationRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileNotificationsRouteDependencies = {
  authenticate: (request: Request) => Promise<string>;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
  listNotifications: typeof listMobileNotifications;
  markAllRead: typeof markAllRead;
  markRead: typeof markRead;
};

const defaultDependencies: MobileNotificationsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listNotifications: listMobileNotifications,
  markAllRead,
  markRead,
};

function getMobileNotificationsQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return MobileNotificationsQuerySchema.parse({
    ...(searchParams.has("cursor") ? { cursor: searchParams.get("cursor") } : {}),
    ...(searchParams.has("limit") ? { limit: searchParams.get("limit") } : {}),
  });
}

export async function mobileNotificationsListRoute(
  request: Request,
  dependencies: MobileNotificationsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:notifications:list");
    const notifications = await dependencies.listNotifications(userId, getMobileNotificationsQuery(request));
    return Response.json(MobileNotificationsResponseSchema.parse(notifications), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileNotificationMarkReadRoute(
  request: Request,
  context: MobileNotificationRouteContext,
  dependencies: MobileNotificationsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:notifications:mark-read");
    const { id } = MobileNotificationIdParamsSchema.parse(await context.params);
    await dependencies.markRead(userId, id);
    return Response.json(MobileNotificationMutationResponseSchema.parse({ success: true }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileNotificationMarkAllReadRoute(
  request: Request,
  dependencies: MobileNotificationsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:notifications:mark-read");
    await dependencies.markAllRead(userId);
    return Response.json(MobileNotificationMutationResponseSchema.parse({ success: true }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
