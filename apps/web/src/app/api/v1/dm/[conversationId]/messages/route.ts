import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { listDMMessages } from "@/lib/dm/service";
import {
  DMConversationParamsSchema,
  DMMessagesQuerySchema,
} from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:messages:list");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const messages = await listDMMessages(
      userId,
      conversationId,
      query.cursor,
      query.limit,
    );

    return Response.json(messages);
  } catch (error) {
    return jsonError(error);
  }
}
