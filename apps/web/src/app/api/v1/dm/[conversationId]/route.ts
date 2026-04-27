import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { hideDirectMessage } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

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
