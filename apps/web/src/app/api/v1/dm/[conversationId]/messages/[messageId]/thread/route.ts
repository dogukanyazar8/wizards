import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listDMThreadMessages } from "@/lib/dm/service";
import {
  DMConversationParamsSchema,
  DMMessagesQuerySchema,
} from "@/lib/dm/types";
import { z } from "zod";

const DMThreadParamsSchema = DMConversationParamsSchema.extend({
  messageId: z.string().min(1),
});

type RouteContext = {
  params: Promise<{ conversationId: string; messageId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { conversationId, messageId } = DMThreadParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    return Response.json(
      await listDMThreadMessages(
        userId,
        conversationId,
        messageId,
        query.cursor,
        query.limit,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
