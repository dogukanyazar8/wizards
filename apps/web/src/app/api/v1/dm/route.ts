import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createOrOpenDirectMessage, listDirectMessages } from "@/lib/dm/service";
import { CreateDMBodySchema, DMConversationsQuerySchema } from "@/lib/dm/types";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:conversations:list");
    const url = new URL(request.url);
    const wantsPaginatedResponse =
      url.searchParams.has("cursor") ||
      url.searchParams.has("limit") ||
      url.searchParams.get("paginated") === "1";
    const query = DMConversationsQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const result = await listDirectMessages(userId, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });

    return Response.json(wantsPaginatedResponse ? result : result.conversations);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:create");
    const input = await parseJsonBody(request, CreateDMBodySchema);
    const conversation = await createOrOpenDirectMessage(userId, input.userId);

    return Response.json(conversation);
  } catch (error) {
    return jsonError(error);
  }
}
