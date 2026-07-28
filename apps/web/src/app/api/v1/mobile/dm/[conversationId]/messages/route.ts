import {
  MobileDMSendMessageRequestSchema,
  MobileDMSendMessageResponseSchema,
} from "@wizards/types";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { sendDirectMessage } from "@/lib/dm/message-send-service";
import { DMConversationParamsSchema } from "@/lib/dm/types";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import { checkDMMessageRateLimits, shouldLogRateLimitUnavailable } from "@/lib/socket/rate-limits";
import { readRequestAttribution } from "@/lib/analytics/client-attribution";
import { getSocketServer } from "@/lib/socket/runtime";
import { mobileDMMessagesGetRoute, type MobileDMMessagesRouteContext } from "./get-route-logic";

type RouteContext = MobileDMMessagesRouteContext;

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
  return mobileDMMessagesGetRoute(request, context);
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
      attribution: readRequestAttribution(request.headers),
      clientNonce: body.clientNonce ?? null,
      content: body.content,
      conversationId,
      forwardOfMessageId: body.forwardOfMessageId ?? null,
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
