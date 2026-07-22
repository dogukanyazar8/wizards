import { MobileChannelPinnedMessagesResponseSchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listChannelPinnedMessages } from "@/lib/workspace/message-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

const MOBILE_CHANNEL_PINS_LIMIT = 50;

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:channel:pins:list");

    const { channelId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number.parseInt(
      searchParams.get("limit") ?? String(MOBILE_CHANNEL_PINS_LIMIT),
      10,
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MOBILE_CHANNEL_PINS_LIMIT)
      : MOBILE_CHANNEL_PINS_LIMIT;

    return Response.json(
      MobileChannelPinnedMessagesResponseSchema.parse(
        await listChannelPinnedMessages(userId, channelId, limit),
      ),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
