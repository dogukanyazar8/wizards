import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { markDirectMessageRead } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function PATCH(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:mark-read");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    await markDirectMessageRead(userId, conversationId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
