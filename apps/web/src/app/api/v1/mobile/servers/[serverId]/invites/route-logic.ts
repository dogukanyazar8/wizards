import {
  MobileServerIdParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerInvitesResponseSchema,
  type WorkspaceInvite,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  buildMobileInviteShareUrl,
  createWorkspaceInviteWithDetails,
  listMobileWorkspaceInvites,
} from "@/lib/workspace/invite-service";

type MobileServerInviteRateLimitAction =
  | "mobile:server:invites:create"
  | "mobile:server:invites:list";

export type MobileServerInvitesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerInvitesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  buildShareUrl: typeof buildMobileInviteShareUrl;
  createInvite: typeof createWorkspaceInviteWithDetails;
  enforceRateLimit(userId: string, action: MobileServerInviteRateLimitAction): Promise<void>;
  listInvites: typeof listMobileWorkspaceInvites;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerInvitesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  buildShareUrl: buildMobileInviteShareUrl,
  createInvite: createWorkspaceInviteWithDetails,
  enforceRateLimit: enforceApiRateLimit,
  listInvites: listMobileWorkspaceInvites,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerInvitesListRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:list");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const invites = await dependencies.listInvites(userId, serverId);

    return Response.json(
      MobileServerInvitesResponseSchema.parse({
        invites: invites.map((invite) => toMobileInvite(invite, dependencies.buildShareUrl)),
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

export async function mobileServerInviteCreateRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileServerInviteCreateRequestSchema);
    const invite = await dependencies.createInvite(userId, serverId, input);

    return Response.json(
      MobileServerInviteCreateResponseSchema.parse({
        invite: toMobileInvite(invite, dependencies.buildShareUrl),
      }),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

function toMobileInvite(invite: WorkspaceInvite, buildShareUrl: (code: string) => string) {
  return {
    channelId: invite.channelId,
    createdAt: invite.createdAt,
    createdByDisplayName: invite.createdByDisplayName,
    expiresAt: invite.expiresAt,
    id: invite.id,
    maxUses: invite.maxUses,
    shareUrl: buildShareUrl(invite.code),
    uses: invite.uses,
  };
}
