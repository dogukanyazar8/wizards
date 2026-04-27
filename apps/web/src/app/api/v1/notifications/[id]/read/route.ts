import { requireApiUserId } from "@/lib/auth/api";
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
    const { id } = await context.params;
    const validatedParams = NotificationIdParamsSchema.parse({ id });

    await markRead(userId, validatedParams.id);

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
