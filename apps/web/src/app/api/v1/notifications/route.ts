import { requireApiUserId } from "@/lib/auth/api";
import { createServerTiming } from "@/lib/server-timing";
import { jsonError } from "@/lib/api";
import { listNotifications } from "@/lib/notifications/service";
import { NotificationsQuerySchema } from "@/lib/notifications/types";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const timing = createServerTiming();

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await requireApiUserId();
    stopAuthTiming();
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "5");

    const validatedQuery = NotificationsQuerySchema.parse({ limit });
    const notifications = await timing.measure("db", () =>
      listNotifications(userId, validatedQuery.limit),
    );

    return Response.json(notifications, { headers: timing.headers() });
  } catch (error) {
    return jsonError(error);
  }
}
