import {
  MobileDMMessagesResponseSchema,
  MobileDMSendMessageRequestSchema,
  MobileDMSendMessageResponseSchema,
} from "@wizards/types";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  getDirectMessageConversationForUser,
  listDMMessages,
} from "@/lib/dm/service";
import { sendDirectMessage } from "@/lib/dm/message-send-service";
import {
  DMConversationParamsSchema,
  DMMessagesQuerySchema,
} from "@/lib/dm/types";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import {
  checkDMMessageRateLimits,
  shouldLogRateLimitUnavailable,
} from "@/lib/socket/rate-limits";
import { getSocketServer } from "@/lib/socket/runtime";

const MOBILE_DM_MESSAGE_LIMIT = 30;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function enforceMobileDMMessageSendRateLimit(input: {
  conversationId: string;
  userId: string;
}) {
  const rateLimitResult = await checkDMMessageRateLimits({
    conversationId: input.conversationId,
    redis: getRedisRate(),
    userId: input.userId,
  });

  if (rateLimitResult.status === "global") {
    throw new ApiError("Too many DM messages. Please slow down.", 429, "RATE_LIMITED");
  }

  if (rateLimitResult.status === "conversation") {
    throw new ApiError("Too many DM messages. Maximum 30 per minute.", 429, "RATE_LIMITED");
  }

  if (rateLimitResult.status === "unavailable") {
    if (shouldLogRateLimitUnavailable("dm-message")) {
      logError(
        rateLimitResult.allowDuringGrace
          ? "[mobile-api] DM message rate limit unavailable; allowing message send during grace window"
          : "[mobile-api] DM message rate limit unavailable; blocking message send",
        rateLimitResult.error,
      );
    }

    if (!rateLimitResult.allowDuringGrace) {
      throw new ApiError(
        "DM message controls are temporarily unavailable. Please try again shortly.",
        503,
        "RATE_LIMIT_UNAVAILABLE",
      );
    }
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "dm:messages:list");

    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const query = DMMessagesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const limit = Math.min(query.limit, MOBILE_DM_MESSAGE_LIMIT);

    const [conversation, messagePage] = await Promise.all([
      getDirectMessageConversationForUser(conversationId, userId),
      listDMMessages(userId, conversationId, query.cursor, limit),
    ]);

    return Response.json(
      MobileDMMessagesResponseSchema.parse({
        conversation,
        messages: messagePage.messages,
        nextCursor: messagePage.nextCursor,
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
    await enforceApiRateLimit(userId, "dm:messages:send");

    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const body = await parseJsonBody(request, MobileDMSendMessageRequestSchema);

    await enforceMobileDMMessageSendRateLimit({ conversationId, userId });

    const message = await sendDirectMessage({
      attachments: body.attachments,
      content: body.content,
      conversationId,
      io: getSocketServer(),
      replyToId: body.replyToId ?? null,
      threadParentId: body.threadParentId ?? null,
      userId,
    });

    return Response.json(MobileDMSendMessageResponseSchema.parse({ message }), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
