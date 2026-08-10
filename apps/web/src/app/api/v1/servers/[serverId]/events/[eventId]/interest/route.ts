import { SetServerScheduledEventInterestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { setServerScheduledEventInterest } from "@/lib/workspace/scheduled-event-service";

type RouteContext = {
  params: Promise<{
    eventId: string;
    serverId: string;
  }>;
};

/**
 * The body carries the desired state rather than a toggle, so two racing taps
 * converge instead of cancelling each other out.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:events:interest");
    const { eventId, serverId } = await context.params;
    const { interested } = await parseJsonBody(request, SetServerScheduledEventInterestSchema);
    const event = await setServerScheduledEventInterest(userId, serverId, eventId, interested);

    return Response.json({ event });
  } catch (error) {
    return jsonError(error);
  }
}
