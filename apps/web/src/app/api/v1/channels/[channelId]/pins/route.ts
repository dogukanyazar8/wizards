import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listChannelPinnedMessages } from "@/lib/workspace/message-service";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "30", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 30;

    return Response.json(await listChannelPinnedMessages(userId, channelId, limit));
  } catch (error) {
    return jsonError(error);
  }
}
