import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getChannelThreadMessages } from "@/lib/workspace/message-service";
import { patchChannelThreadStateRoute } from "./route-logic";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:messages:list");
    const { channelId, messageId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("before") || undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

    return Response.json(
      await getChannelThreadMessages(channelId, messageId, userId, cursor, limit),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return patchChannelThreadStateRoute(request, context);
}
