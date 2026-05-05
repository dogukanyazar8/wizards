import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import {
  emitServerUnreadUpdateToUser,
  markChannelReadState,
} from "@/lib/workspace/unread-service";

type RouteContext = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function PATCH(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:mark-read");
    const { channelId } = await context.params;

    const channel = await prisma.channel.findUnique({
      where: {
        id: channelId,
      },
      select: {
        serverId: true,
      },
    });

    if (!channel?.serverId) {
      throw new ApiError("Channel not found", 404);
    }

    const [membership, serverBan] = await Promise.all([
      prisma.serverMember.findUnique({
        where: {
          userId_serverId: {
            serverId: channel.serverId,
            userId,
          },
        },
        select: {
          id: true,
        },
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

    if (!membership) {
      throw new ApiError("You are not a member of this server", 403);
    }

    const latestMessage = await prisma.message.findFirst({
      where: {
        channelId,
        threadId: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    await markChannelReadState({
      channelId,
      lastReadAt: new Date(),
      lastReadMessageId: latestMessage?.id ?? null,
      userId,
    });

    const unreadCount = await emitServerUnreadUpdateToUser(userId, channel.serverId);

    return Response.json({
      serverId: channel.serverId,
      unreadCount,
    });
  } catch (error) {
    return jsonError(error);
  }
}
