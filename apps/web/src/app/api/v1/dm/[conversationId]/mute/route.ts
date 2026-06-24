import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { setDirectMessageMuted } from "@/lib/dm/service";
import { DMConversationParamsSchema, SetDMMutedBodySchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:mute");
    const [{ conversationId }, input] = await Promise.all([
      DMConversationParamsSchema.parse(await context.params),
      parseJsonBody(request, SetDMMutedBodySchema),
    ]);

    await setDirectMessageMuted(userId, conversationId, input.muted);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
