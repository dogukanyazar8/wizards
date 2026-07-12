import { MobileDMDetailsParamsSchema, MobileDMDetailsQuerySchema, MobileDMDetailsResponseSchema } from "@wizards/types";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getMobileDMDetails } from "@/lib/dm/mobile-details-service";

export type MobileDMDetailsRouteContext = { params: Promise<Record<string, string>> };
export type MobileDMDetailsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getDetails: typeof getMobileDMDetails;
};
const defaultDependencies: MobileDMDetailsRouteDependencies = { authenticate: (request) => requireMobileApiUserId(request), enforceRateLimit: enforceApiRateLimit, getDetails: getMobileDMDetails };

export async function mobileDMDetailsRoute(request: Request, context: MobileDMDetailsRouteContext, dependencies: MobileDMDetailsRouteDependencies = defaultDependencies) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:details");
    const { conversationId } = MobileDMDetailsParamsSchema.parse(await context.params);
    const query = MobileDMDetailsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    return Response.json(MobileDMDetailsResponseSchema.parse(await dependencies.getDetails({ ...query, conversationId, userId })));
  } catch (error) {
    return jsonError(error);
  }
}
