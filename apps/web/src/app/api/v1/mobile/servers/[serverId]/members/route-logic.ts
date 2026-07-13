import {
  MobileServerIdParamsSchema,
  MobileServerMembersQuerySchema,
  MobileServerMembersResponseSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  mapMobileServerMemberRoleIds,
  resolveMobileServerMemberActions,
} from "@/lib/workspace/mobile-capabilities";
import { listMobileWorkspaceServerMembersWithAccess } from "@/lib/workspace/server-service";

type MobileServerMembersRateLimitAction = "mobile:server:members:list";

export type MobileServerMembersRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerMembersRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerMembersRateLimitAction): Promise<void>;
  listMembersWithAccess: typeof listMobileWorkspaceServerMembersWithAccess;
  mapRoleIds: typeof mapMobileServerMemberRoleIds;
  resolveActions: typeof resolveMobileServerMemberActions;
};

const defaultDependencies: MobileServerMembersRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listMembersWithAccess: listMobileWorkspaceServerMembersWithAccess,
  mapRoleIds: mapMobileServerMemberRoleIds,
  resolveActions: resolveMobileServerMemberActions,
};

export async function mobileServerMembersListRoute(
  request: Request,
  context: MobileServerMembersRouteContext,
  dependencies: MobileServerMembersRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:members:list");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const query = MobileServerMembersQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const result = await dependencies.listMembersWithAccess(userId, serverId, {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
    });

    return Response.json(
      MobileServerMembersResponseSchema.parse({
        memberPage: result.memberPage,
        members: result.members.map(({ authorizationRoles, member }) => ({
          accessLevel: member.accessLevel,
          actions: dependencies.resolveActions(result.access, {
            id: member.id,
            roles: authorizationRoles.map(({ isDefault, managed, permissions }) => ({
              isDefault,
              managed,
              permissions,
            })),
            userId: member.userId,
          }),
          avatarUrl: member.avatarUrl,
          customStatus: member.customStatus,
          displayName: member.displayName,
          id: member.id,
          roleIds: dependencies.mapRoleIds(authorizationRoles),
          roles: member.roles.map(({ color, id, name }) => ({ color, id, name })),
          status: member.status,
          userId: member.userId,
          username: member.username,
        })),
      }),
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
