import { requireApiUserId } from "@/lib/auth/api";
import { ApiError, jsonError } from "@/lib/api";
import { getChannelMessages } from "@/lib/workspace/message-service";
import { prisma } from "@wizards/db";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);

    const cursor = searchParams.get("before") || undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    // Verify channel exists and user is member of its server
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });

    if (!channel?.serverId) {
      throw new ApiError("Channel not found", 404);
    }

    const member = await prisma.serverMember.findFirst({
      where: { serverId: channel.serverId, userId },
      select: { id: true },
    });

    if (!member) {
      throw new ApiError("Not a member of this server", 403);
    }

    // Fetch messages
    const result = await getChannelMessages(channelId, cursor, limit);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
