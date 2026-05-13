import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getChannelMessages } from "@/lib/workspace/message-service";
import { getSocketServer } from "@/lib/socket/runtime";
import { emitServerUnreadUpdatesForServer } from "@/lib/workspace/unread-service";
import { clearWorkspaceChannelHistory } from "@/lib/workspace/service";
import { ChannelType } from "@wizards/db";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:messages:list");
    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);

    const cursor = searchParams.get("before") || undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });
    const result = await getChannelMessages(channelId, cursor, limit);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:clear-history");
    const { channelId } = await context.params;
    const result = await clearWorkspaceChannelHistory(userId, channelId);

    await emitServerUnreadUpdatesForServer(result.serverId);

    const io = getSocketServer();
    io?.to(channelId).emit("message:history_cleared", {
      channelId,
    });

    return Response.json({
      deletedCount: result.deletedCount,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
