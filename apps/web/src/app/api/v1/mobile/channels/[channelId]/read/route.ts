import { MobileChannelMarkReadResponseSchema } from "@wizards/types";
import { ChannelType, prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  emitServerUnreadUpdateToUser,
  markChannelReadState,
} from "@/lib/workspace/unread-service";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:channel:mark-read");
    const { channelId } = await context.params;
    const channel = await prisma.channel.findUnique({
      select: { serverId: true },
      where: { id: channelId },
    });

    if (!channel?.serverId) {
      throw new ApiError("Channel not found", 404);
    }

    const [membership, serverBan] = await Promise.all([
      prisma.serverMember.findUnique({
        select: { joinedAt: true },
        where: { userId_serverId: { serverId: channel.serverId, userId } },
      }),
      prisma.serverBan.findUnique({
        select: { id: true },
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      }),
    ]);
    if (serverBan) {
      throw new ApiError("You are banned from this server", 403, "SERVER_BANNED");
    }
    if (!membership) {
      throw new ApiError("You are not a member of this server", 403);
    }

    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });
    const readState = await prisma.channelReadState.findUnique({
      select: { lastReadAt: true },
      where: { channelId_userId: { channelId, userId } },
    });
    const firstUnreadMessage = await prisma.message.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
      where: {
        channelId,
        createdAt: { gt: readState?.lastReadAt ?? membership.joinedAt },
        deletedAt: null,
        threadId: null,
        threadParentId: null,
      },
    });
    const latestMessage = await prisma.message.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
      where: { channelId, threadId: null, threadParentId: null },
    });
    await markChannelReadState({
      channelId,
      lastReadAt: new Date(),
      lastReadMessageId: latestMessage?.id ?? null,
      userId,
    });
    const serverUnread = await emitServerUnreadUpdateToUser(userId, channel.serverId);

    return Response.json(
      MobileChannelMarkReadResponseSchema.parse({
        channelId,
        firstUnreadMessageId: firstUnreadMessage?.id ?? null,
        mentionCount: 0,
        serverId: channel.serverId,
        serverMentionCount: serverUnread.mentionCount,
        serverUnreadCount: serverUnread.unreadCount,
        unreadCount: 0,
      }),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
