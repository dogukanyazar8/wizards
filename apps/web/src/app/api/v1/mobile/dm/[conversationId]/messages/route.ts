import { MobileDMMessagesResponseSchema } from "@wizards/types";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  getDirectMessageConversationForUser,
  listDMMessages,
} from "@/lib/dm/service";
import {
  DMConversationParamsSchema,
  DMMessagesQuerySchema,
} from "@/lib/dm/types";

const MOBILE_DM_MESSAGE_LIMIT = 30;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "dm:messages:list");

    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const limit = Math.min(query.limit, MOBILE_DM_MESSAGE_LIMIT);

    const [conversation, messagePage] = await Promise.all([
      getDirectMessageConversationForUser(conversationId, userId),
      listDMMessages(userId, conversationId, query.cursor, limit),
    ]);

    return Response.json(
      MobileDMMessagesResponseSchema.parse({
        conversation,
        messages: messagePage.messages,
        nextCursor: messagePage.nextCursor,
      }),
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
