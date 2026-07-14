import {
  MobileChannelMessagesResponseSchema,
  MobileChannelSendMessageRequestSchema,
  MobileChannelSendMessageResponseSchema,
  type MobileWorkspaceChannelSummary,
} from "@wizards/types";
import { ChannelType, prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import {
  checkChannelMessageRateLimit,
  shouldLogRateLimitUnavailable,
} from "@/lib/socket/rate-limits";
import { getSocketServer } from "@/lib/socket/runtime";
import { sendChannelMessage } from "@/lib/workspace/channel-message-send-service";
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

async function enforceMobileChannelMessageSendRateLimit(userId: string) {
  const rateLimitResult = await checkChannelMessageRateLimit({
    redis: getRedisRate(),
    userId,
  });

  if (rateLimitResult.status === "limited") {
    throw new ApiError("Too many messages. Maximum 30 per minute.", 429, "RATE_LIMITED");
  }

  if (rateLimitResult.status === "unavailable") {
    if (shouldLogRateLimitUnavailable("channel-message")) {
      logError(
        rateLimitResult.allowDuringGrace
          ? "[mobile-api] Channel message rate limit unavailable; allowing send during grace window"
          : "[mobile-api] Channel message rate limit unavailable; blocking send",
        rateLimitResult.error,
      );
    }

    if (!rateLimitResult.allowDuringGrace) {
      throw new ApiError(
        "Message controls are temporarily unavailable. Please try again shortly.",
        503,
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
  }
}

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
      getChannelMessages(channelId, cursor, limit, userId),
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:channel:messages:send");

    const { channelId } = await context.params;
    const body = await parseJsonBody(request, MobileChannelSendMessageRequestSchema);

    await enforceMobileChannelMessageSendRateLimit(userId);

    const message = await sendChannelMessage({
      attachments: body.attachments,
      channelId,
      content: body.content,
      io: getSocketServer(),
      replyToId: body.replyToId ?? null,
      threadParentId: body.threadParentId ?? null,
      userId,
    });

    return Response.json(MobileChannelSendMessageResponseSchema.parse({ message }), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
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
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          author: { select: { displayName: true, id: true, username: true } },
          content: true,
          createdAt: true,
          id: true,
        },
        take: 1,
        where: { deletedAt: null, threadId: null, threadParentId: null },
      },
      name: true,
      position: true,
      topic: true,
      type: true,
    },
  });

  if (!channel || channel.type !== ChannelType.TEXT) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }

  const lastMessage = channel.messages[0];
  const text = lastMessage?.content.trim().replace(/\s+/g, " ").slice(0, 240) ?? "";

  return {
    categoryId: channel.categoryId,
    categoryName: channel.category?.name ?? null,
    id: channel.id,
    lastMessage:
      lastMessage && text.length > 0
        ? {
            author: lastMessage.author,
            createdAt: lastMessage.createdAt.toISOString(),
            id: lastMessage.id,
            text,
          }
        : null,
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
