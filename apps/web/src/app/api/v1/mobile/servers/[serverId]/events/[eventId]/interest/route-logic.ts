import {
  MobileServerEventParamsSchema,
  MobileServerScheduledEventResponseSchema,
  SetServerScheduledEventInterestSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { setServerScheduledEventInterest } from "@/lib/workspace/scheduled-event-service";

export type MobileServerEventInterestRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerEventInterestRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:server:events:interest"): Promise<void>;
  parseBody: typeof parseJsonBody;
  setInterest: typeof setServerScheduledEventInterest;
};

const defaultDependencies: MobileServerEventInterestRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setInterest: setServerScheduledEventInterest,
};

/**
 * A body rather than a bodyless toggle: "Hatırlat" is idempotent per desired
 * state, so the client sends the state it wants instead of flipping whatever
 * the server currently holds. Two taps racing then converge instead of
 * cancelling each other out.
 */
export async function mobileServerEventInterestRoute(
  request: Request,
  context: MobileServerEventInterestRouteContext,
  dependencies: MobileServerEventInterestRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:events:interest");
    const { eventId, serverId } = MobileServerEventParamsSchema.parse(await context.params);
    const { interested } = await dependencies.parseBody(
      request,
      SetServerScheduledEventInterestSchema,
    );
    const event = await dependencies.setInterest(userId, serverId, eventId, interested);

    return Response.json(MobileServerScheduledEventResponseSchema.parse({ event }));
  } catch (error) {
    return jsonError(error);
  }
}
