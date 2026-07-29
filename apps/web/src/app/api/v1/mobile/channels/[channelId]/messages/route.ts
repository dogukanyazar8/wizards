import {
  MobileChannelSendMessageRequestSchema,
  MobileChannelSendMessageResponseSchema,
} from "@wizards/types";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { authorizeMobileApiRequest } from "@/lib/auth/api";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";
import {
  checkChannelMessageRateLimit,
  shouldLogRateLimitUnavailable,
} from "@/lib/socket/rate-limits";
import { readRequestAttribution } from "@/lib/analytics/client-attribution";
import { createServerTiming } from "@/lib/server-timing";
import { getSocketServer } from "@/lib/socket/runtime";
import { sendChannelMessage } from "@/lib/workspace/channel-message-send-service";
import { mobileChannelMessagesGetRoute } from "./get-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  return mobileChannelMessagesGetRoute(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  // A device baseline put this round trip at 589ms p50 after the fan-out came
  // off it. `auth` and `db` split what is left into work the server did and time
  // the wire took, so the next fix is aimed rather than guessed.
  const timing = createServerTiming();

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await authorizeMobileApiRequest(request, "mobile:channel:messages:send");
    stopAuthTiming();

    const { channelId } = await context.params;
    const body = await parseJsonBody(request, MobileChannelSendMessageRequestSchema);

    await timing.measure("ratelimit", () => enforceMobileChannelMessageSendRateLimit(userId));

    const message = await timing.measure("db", () =>
      sendChannelMessage({
        alsoSendToChannel: body.alsoSendToChannel === true,
        attachments: body.attachments,
        attribution: readRequestAttribution(request.headers),
        channelId,
        clientNonce: body.clientNonce ?? null,
        content: body.content,
        forwardOfMessageId: body.forwardOfMessageId ?? null,
        io: getSocketServer(),
        replyToId: body.replyToId ?? null,
        threadParentId: body.threadParentId ?? null,
        userId,
      }),
    );

    return Response.json(MobileChannelSendMessageResponseSchema.parse({ message }), {
      headers: timing.headers({
        "Cache-Control": "no-store, no-cache, must-revalidate",
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
