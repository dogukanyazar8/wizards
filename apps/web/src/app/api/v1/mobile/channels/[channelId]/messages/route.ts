import {
  MobileChannelMessagesResponseSchema,
  type MobileWorkspaceChannelSummary,
} from "@wizards/types";
import { ChannelType, prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getChannelMessages } from "@/lib/workspace/message-service";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MOBILE_CHANNEL_MESSAGES_LIMIT = 30;

type RouteContext = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:channel:messages:list");

    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("before") || searchParams.get("cursor") || undefined;
    const requestedLimit = Number.parseInt(
      searchParams.get("limit") ?? String(MOBILE_CHANNEL_MESSAGES_LIMIT),
      10,
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MOBILE_CHANNEL_MESSAGES_LIMIT)
      : MOBILE_CHANNEL_MESSAGES_LIMIT;

    await requireChannelPermissionForUser(userId, channelId, PermissionBits.VIEW_CHANNEL, {
      requiredType: ChannelType.TEXT,
    });

    const [channel, result] = await Promise.all([
      getMobileChannelSummary(channelId),
      getChannelMessages(channelId, cursor, limit),
    ]);

    return Response.json(
      MobileChannelMessagesResponseSchema.parse({
        channel,
        hasMore: result.hasMore,
        messages: result.messages,
        nextCursor: result.nextCursor ?? null,
      }),
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}

async function getMobileChannelSummary(
  channelId: string,
): Promise<MobileWorkspaceChannelSummary> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      category: {
        select: {
          name: true,
        },
      },
      categoryId: true,
      id: true,
      locked: true,
      name: true,
      position: true,
      topic: true,
      type: true,
    },
  });

  if (!channel || channel.type !== ChannelType.TEXT) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  return {
    categoryId: channel.categoryId,
    categoryName: channel.category?.name ?? null,
    id: channel.id,
    locked: channel.locked,
    mentionCount: 0,
    name: channel.name,
    position: channel.position,
    readOnly: false,
    topic: channel.topic,
    type: channel.type,
    unreadCount: 0,
  };
}
