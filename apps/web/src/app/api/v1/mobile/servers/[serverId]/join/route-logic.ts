import { MobileMutationSuccessResponseSchema, MobileServerIdParamsSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { joinPublicWorkspaceServer } from "@/lib/workspace/invite-service";

export type MobileServerJoinPublicRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerJoinPublicRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:server:join-public"): Promise<void>;
  joinServer: typeof joinPublicWorkspaceServer;
};

const defaultDependencies: MobileServerJoinPublicRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  joinServer: joinPublicWorkspaceServer,
};

/**
 * Mobile counterpart of `servers/[serverId]/join/route-logic.ts`. Distinct
 * from `mobile/servers/join` (invite-code redemption, body-carrying) -- this
 * one joins a public server straight from its id, so it carries no body, the
 * same as the web route. Response reuses the generic mobile mutation-success
 * envelope rather than inventing a second, near-identical join response
 * schema: the caller already knows the serverId from the path it just posted.
 */
export async function mobileServerJoinPublicRoute(
  request: Request,
  context: MobileServerJoinPublicRouteContext,
  dependencies: MobileServerJoinPublicRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:join-public");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    await dependencies.joinServer(userId, serverId);

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
