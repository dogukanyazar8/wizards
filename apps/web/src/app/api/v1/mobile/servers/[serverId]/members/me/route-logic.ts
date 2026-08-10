import { MobileMutationSuccessResponseSchema, MobileServerIdParamsSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { leaveWorkspaceServer } from "@/lib/workspace/member-service";

type MobileServerLeaveRateLimitAction = "mobile:server:leave";

export type MobileServerLeaveRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerLeaveRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerLeaveRateLimitAction): Promise<void>;
  leaveServer: typeof leaveWorkspaceServer;
};

const defaultDependencies: MobileServerLeaveRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  leaveServer: leaveWorkspaceServer,
};

/**
 * 6c "Sunucudan ayrıl", mobile twin of `DELETE servers/[serverId]/members/me`.
 *
 * The whole request is the path plus the session: no body, and the member row
 * removed is always the caller's own. Every rule lives in
 * `leaveWorkspaceServer` — owner refusal, the member-count decrement inside the
 * same transaction, permission-cache invalidation and the socket detach — so
 * this route adds a mobile budget and nothing else. Duplicating any of it here
 * would let the two clients drift apart on who may leave.
 */
export async function mobileServerLeaveRoute(
  request: Request,
  context: MobileServerLeaveRouteContext,
  dependencies: MobileServerLeaveRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:leave");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    await dependencies.leaveServer(userId, serverId);

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
