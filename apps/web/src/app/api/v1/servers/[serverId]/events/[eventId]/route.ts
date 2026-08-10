import { UpdateServerScheduledEventSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  cancelServerScheduledEvent,
  updateServerScheduledEvent,
} from "@/lib/workspace/scheduled-event-service";

type RouteContext = {
  params: Promise<{
    eventId: string;
    serverId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:events:update");
    const { eventId, serverId } = await context.params;
    const input = await parseJsonBody(request, UpdateServerScheduledEventSchema);
    const event = await updateServerScheduledEvent(userId, serverId, eventId, input);

    return Response.json({ event });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Cancelling never deletes the row -- an interested member's client would just
 * see the card vanish -- so the caller gets the event back with its new status
 * instead of a 204.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:events:cancel");
    const { eventId, serverId } = await context.params;
    const event = await cancelServerScheduledEvent(userId, serverId, eventId);

    return Response.json({ event });
  } catch (error) {
    return jsonError(error);
  }
}
