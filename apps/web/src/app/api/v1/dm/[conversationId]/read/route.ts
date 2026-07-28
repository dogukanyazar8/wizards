import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { broadcastDirectMessageRead } from "@/lib/dm/delivery-receipts";
import { markDirectMessageRead } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";
import { logError } from "@/lib/logger";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function PATCH(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:mark-read");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    await markDirectMessageRead(userId, conversationId);
    // The other side's third tick; a broadcast failure must not fail the read.
    await broadcastDirectMessageRead(userId, conversationId).catch((error: unknown) => {
      logError("[dm] read receipt broadcast failed", error);
    });

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
