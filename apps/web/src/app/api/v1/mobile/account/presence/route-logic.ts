import { MobilePresenceResponseSchema, MobilePresenceUpdateSchema } from "@wizards/types";

import { updateAccountPresence } from "@/lib/account/service";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";

export type MobilePresenceRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updatePresence: typeof updateAccountPresence;
};

const defaultDependencies: MobilePresenceRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updatePresence: updateAccountPresence,
};

export async function mobilePresenceUpdateRoute(
  request: Request,
  dependencies: MobilePresenceRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:presence");
    const { status } = await dependencies.parseBody(request, MobilePresenceUpdateSchema);
    const presence = await dependencies.updatePresence(userId, status);
    return Response.json(MobilePresenceResponseSchema.parse({ status: presence.status }));
  } catch (error) {
    return jsonError(error);
  }
}
