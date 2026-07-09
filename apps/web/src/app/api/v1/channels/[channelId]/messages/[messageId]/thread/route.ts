import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getChannelThreadMessages } from "@/lib/workspace/message-service";
import { ChannelType } from "@wizards/db";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

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
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });

    return Response.json(
      await getChannelThreadMessages(channelId, messageId, cursor, limit, userId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
