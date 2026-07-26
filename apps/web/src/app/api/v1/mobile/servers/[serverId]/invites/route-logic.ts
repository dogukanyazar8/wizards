import {
  MobileServerIdParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerInviteLinkUpdateRequestSchema,
  MobileServerInviteParamsSchema,
  MobileServerInviteQrResponseSchema,
  MobileServerInviteSheetResponseSchema,
  MobileServerInvitesResponseSchema,
  MobileServerTargetedInviteCreateRequestSchema,
  MobileServerTargetedInviteCreateResponseSchema,
  type WorkspaceInvite,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  buildMobileInviteShareUrl,
  buildMobileServerInviteQrCode,
  createTargetedServerInvite,
  createWorkspaceInviteWithDetails,
  getMobileServerInviteSheet,
  listMobileWorkspaceInvites,
  replaceMobileServerLinkInvite,
  revokeWorkspaceInvite,
} from "@/lib/workspace/invite-service";

type MobileServerInviteRateLimitAction =
  | "mobile:server:invites:create"
  | "mobile:server:invites:list"
  | "mobile:server:invites:qr"
  | "mobile:server:invites:revoke"
  | "mobile:server:invites:sheet"
  | "mobile:server:invites:target";

export type MobileServerInvitesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerInvitesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  buildQrCode: typeof buildMobileServerInviteQrCode;
  buildShareUrl: typeof buildMobileInviteShareUrl;
  createInvite: typeof createWorkspaceInviteWithDetails;
  createTargetedInvite: typeof createTargetedServerInvite;
  enforceRateLimit(userId: string, action: MobileServerInviteRateLimitAction): Promise<void>;
  getInviteSheet: typeof getMobileServerInviteSheet;
  listInvites: typeof listMobileWorkspaceInvites;
  parseBody: typeof parseJsonBody;
  replaceLinkInvite: typeof replaceMobileServerLinkInvite;
  revokeInvite: typeof revokeWorkspaceInvite;
};

const defaultDependencies: MobileServerInvitesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  buildQrCode: buildMobileServerInviteQrCode,
  buildShareUrl: buildMobileInviteShareUrl,
  createInvite: createWorkspaceInviteWithDetails,
  createTargetedInvite: createTargetedServerInvite,
  enforceRateLimit: enforceApiRateLimit,
  getInviteSheet: getMobileServerInviteSheet,
  listInvites: listMobileWorkspaceInvites,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  replaceLinkInvite: replaceMobileServerLinkInvite,
  revokeInvite: revokeWorkspaceInvite,
};

/** The sheet reads live invite state, so it must never come from a cache. */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

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
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** 2a/2b — link card, friends list and pending targeted invites in one read. */
export async function mobileServerInviteSheetRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:sheet");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const sheet = await dependencies.getInviteSheet(userId, serverId);

    return Response.json(MobileServerInviteSheetResponseSchema.parse(sheet), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** 2a "Düzenle" — mint a replacement link and drop the previous one. */
export async function mobileServerInviteLinkUpdateRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileServerInviteLinkUpdateRequestSchema);
    const invite = await dependencies.replaceLinkInvite(userId, serverId, input);

    return Response.json(
      MobileServerInviteCreateResponseSchema.parse({
        invite: toMobileInvite(invite, dependencies.buildShareUrl),
      }),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** 2a/2b "Davet et" on a person — a single-seat invite aimed at one account. */
export async function mobileServerTargetedInviteCreateRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:target");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(
      request,
      MobileServerTargetedInviteCreateRequestSchema,
    );
    const invite = await dependencies.createTargetedInvite(userId, serverId, input.userId);

    return Response.json(MobileServerTargetedInviteCreateResponseSchema.parse({ invite }), {
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** 2a "QR kod" — the link rendered as a PNG data URL, like the 2FA setup QR. */
export async function mobileServerInviteQrRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:qr");
    const { inviteId, serverId } = MobileServerInviteParamsSchema.parse(await context.params);
    const qrCodeDataUrl = await dependencies.buildQrCode(userId, serverId, inviteId);

    return Response.json(MobileServerInviteQrResponseSchema.parse({ qrCodeDataUrl }), {
      headers: NO_STORE_HEADERS,
    });
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

export async function mobileServerInviteRevokeRoute(
  request: Request,
  context: MobileServerInvitesRouteContext,
  dependencies: MobileServerInvitesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:invites:revoke");
    const { inviteId, serverId } = MobileServerInviteParamsSchema.parse(await context.params);
    await dependencies.revokeInvite(userId, serverId, inviteId);

    return Response.json({ success: true });
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
