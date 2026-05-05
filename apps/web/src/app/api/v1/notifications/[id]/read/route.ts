import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { markRead } from "@/lib/notifications/service";
import { NotificationIdParamsSchema } from "@/lib/notifications/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "notification:mark-read");
    const { id } = await context.params;
    const validatedParams = NotificationIdParamsSchema.parse({ id });

    await markRead(userId, validatedParams.id);

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
