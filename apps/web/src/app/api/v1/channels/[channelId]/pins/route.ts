import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { listChannelPinnedMessages } from "@/lib/workspace/message-service";
import { ChannelPinCursorSchema } from "@/lib/servers/channel-pins";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:pins:list");
    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "30", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;

    const cursor =
      searchParams.has("before") || searchParams.has("beforeId")
        ? ChannelPinCursorSchema.parse({
            pinnedAt: searchParams.get("before"),
            messageId: searchParams.get("beforeId"),
          })
        : undefined;
    return Response.json(await listChannelPinnedMessages(userId, channelId, limit, cursor));
  } catch (error) {
    return jsonError(error);
  }
}
