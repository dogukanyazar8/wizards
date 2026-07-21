import { requireApiUserId } from "@/lib/auth/api";
import { createServerTiming } from "@/lib/server-timing";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { listDMMessages } from "@/lib/dm/service";
import { DMConversationParamsSchema, DMMessagesQuerySchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const timing = createServerTiming();

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:messages:list");
    stopAuthTiming();
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const messages = await timing.measure("db", () =>
      listDMMessages(userId, conversationId, query.cursor, query.limit),
    );

    return Response.json(messages, { headers: timing.headers() });
  } catch (error) {
    return jsonError(error);
  }
}
