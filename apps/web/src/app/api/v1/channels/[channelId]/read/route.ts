import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
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
          joinedAt: true,
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

    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL);

    const readState = await prisma.channelReadState.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
      select: {
        lastReadAt: true,
      },
    });

    const unreadBaseline = readState?.lastReadAt ?? membership.joinedAt;
    const firstUnreadMessage = await prisma.message.findFirst({
      where: {
        channelId,
        createdAt: {
          gt: unreadBaseline,
        },
        deletedAt: null,
        threadId: null,
        threadParentId: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    const latestMessage = await prisma.message.findFirst({
      where: {
        channelId,
        threadId: null,
        threadParentId: null,
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

    const serverUnread = await emitServerUnreadUpdateToUser(userId, channel.serverId);

    return Response.json({
      firstUnreadMessageId: firstUnreadMessage?.id ?? null,
      mentionCount: 0,
      serverId: channel.serverId,
      unreadCount: serverUnread.unreadCount,
    });
  } catch (error) {
    return jsonError(error);
  }
}
