import { requireApiUserId } from "@/lib/auth/api";
import { ApiError, jsonError } from "@/lib/api";
import { getChannelThreadMessages } from "@/lib/workspace/message-service";
import { prisma } from "@wizards/db";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { channelId, messageId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("before") || undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });

    if (!channel?.serverId) {
      throw new ApiError("Channel not found", 404, "NOT_FOUND");
    }

    const [member, serverBan] = await Promise.all([
      prisma.serverMember.findFirst({
        where: { serverId: channel.serverId, userId },
        select: { id: true },
      }),
      prisma.serverBan.findUnique({
        where: {
          serverId_userId: {
            serverId: channel.serverId,
            userId,
          },
        },
        select: { id: true },
      }),
    ]);

    if (serverBan) {
      throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
    }

    if (!member) {
      throw new ApiError("Not a member of this server", 403, "FORBIDDEN");
    }

    return Response.json(
      await getChannelThreadMessages(channelId, messageId, cursor, limit),
    );
  } catch (error) {
    return jsonError(error);
  }
}
