import {
  CreateServerScheduledEventSchema,
  MobileServerIdParamsSchema,
  MobileServerScheduledEventResponseSchema,
  MobileServerScheduledEventsQuerySchema,
  MobileServerScheduledEventsResponseSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  createServerScheduledEvent,
  listServerScheduledEvents,
} from "@/lib/workspace/scheduled-event-service";

type MobileServerEventsRateLimitAction =
  "mobile:server:events:create" | "mobile:server:events:list";

export type MobileServerEventsRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerEventsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createEvent: typeof createServerScheduledEvent;
  enforceRateLimit(userId: string, action: MobileServerEventsRateLimitAction): Promise<void>;
  listEvents: typeof listServerScheduledEvents;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerEventsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createEvent: createServerScheduledEvent,
  enforceRateLimit: enforceApiRateLimit,
  listEvents: listServerScheduledEvents,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerEventsListRoute(
  request: Request,
  context: MobileServerEventsRouteContext,
  dependencies: MobileServerEventsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:events:list");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const { includePast } = MobileServerScheduledEventsQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );
    const events = await dependencies.listEvents(serverId, userId, { includePast });

    return Response.json(MobileServerScheduledEventsResponseSchema.parse({ events }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerEventCreateRoute(
  request: Request,
  context: MobileServerEventsRouteContext,
  dependencies: MobileServerEventsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:events:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, CreateServerScheduledEventSchema);
    const event = await dependencies.createEvent(userId, serverId, input);

    return Response.json(MobileServerScheduledEventResponseSchema.parse({ event }), {
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
