import {
  MobileMutationSuccessResponseSchema,
  MobileServerMemberParamsSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { kickWorkspaceMember } from "@/lib/workspace/member-service";

type MobileServerMemberKickRateLimitAction = "mobile:server:member:kick";

export type MobileServerMemberKickRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerMemberKickRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerMemberKickRateLimitAction): Promise<void>;
  kickMember: typeof kickWorkspaceMember;
};

const defaultDependencies: MobileServerMemberKickRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  kickMember: kickWorkspaceMember,
};

export async function mobileServerMemberKickRoute(
  request: Request,
  context: MobileServerMemberKickRouteContext,
  dependencies: MobileServerMemberKickRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:member:kick");
    const { memberId, serverId } = MobileServerMemberParamsSchema.parse(await context.params);
    await dependencies.kickMember(userId, serverId, memberId);

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
