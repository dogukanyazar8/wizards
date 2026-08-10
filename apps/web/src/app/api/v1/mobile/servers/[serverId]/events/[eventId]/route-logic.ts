import {
  MobileServerEventParamsSchema,
  MobileServerScheduledEventResponseSchema,
  UpdateServerScheduledEventSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  cancelServerScheduledEvent,
  updateServerScheduledEvent,
} from "@/lib/workspace/scheduled-event-service";

type MobileServerEventRateLimitAction =
  "mobile:server:events:cancel" | "mobile:server:events:update";

export type MobileServerEventRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerEventRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  cancelEvent: typeof cancelServerScheduledEvent;
  enforceRateLimit(userId: string, action: MobileServerEventRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateEvent: typeof updateServerScheduledEvent;
};

const defaultDependencies: MobileServerEventRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  cancelEvent: cancelServerScheduledEvent,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateEvent: updateServerScheduledEvent,
};

export async function mobileServerEventUpdateRoute(
  request: Request,
  context: MobileServerEventRouteContext,
  dependencies: MobileServerEventRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:events:update");
    const { eventId, serverId } = MobileServerEventParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, UpdateServerScheduledEventSchema);
    const event = await dependencies.updateEvent(userId, serverId, eventId, input);

    return Response.json(MobileServerScheduledEventResponseSchema.parse({ event }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerEventCancelRoute(
  request: Request,
  context: MobileServerEventRouteContext,
  dependencies: MobileServerEventRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:events:cancel");
    const { eventId, serverId } = MobileServerEventParamsSchema.parse(await context.params);
    // The path is the whole request: which event, cancelled by whoever holds
    // MANAGE_SERVER. Cancelling never deletes the row, so the client still
    // gets the event back with its new status.
    const event = await dependencies.cancelEvent(userId, serverId, eventId);

    return Response.json(MobileServerScheduledEventResponseSchema.parse({ event }));
  } catch (error) {
    return jsonError(error);
  }
}
