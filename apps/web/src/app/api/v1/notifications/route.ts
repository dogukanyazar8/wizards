import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listNotifications } from "@/lib/notifications/service";
import { NotificationsQuerySchema } from "@/lib/notifications/types";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireApiUserId();
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "5");

    const validatedQuery = NotificationsQuerySchema.parse({ limit });
    const notifications = await listNotifications(userId, validatedQuery.limit);

    return Response.json(notifications);
  } catch (error) {
    return jsonError(error);
  }
}
