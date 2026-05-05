import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getDirectMessageConversationForUser, hideDirectMessage } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:hide");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const conversation = await getDirectMessageConversationForUser(conversationId, userId);

    return Response.json(conversation);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    await hideDirectMessage(userId, conversationId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
