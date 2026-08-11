import { GroupInvitePreviewResponseSchema, GroupInviteResponseSchema } from "@wizards/types";
import { prisma } from "@wizards/db";

import {
  groupInviteJoinRoute,
  groupInvitePreviewRoute,
  groupInviteReadRoute,
  groupInviteRotateRoute,
  groupInviteToggleRoute,
  type GroupInviteRouteDependencies,
} from "@/app/api/v1/dm/groups/invite-route-logic";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { emitGroupInviteChanged, emitGroupMemberJoined } from "@/lib/dm/group-realtime";
import {
  joinGroupViaInvite,
  previewGroupInvite,
  readGroupInvite,
  rotateGroupInvite,
  setGroupInviteEnabled,
} from "@/lib/dm/group-invite-service";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Faz 2 §B3. The mobile mirror, added in the same phase as the web routes —
 * mobile never calls the web endpoints in this repo, so a mirror that lands a
 * phase later is an endpoint the app cannot reach.
 */
export const mobileGroupInviteDefaults: GroupInviteRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  emitInviteChanged: emitGroupInviteChanged,
  emitMemberJoined: emitGroupMemberJoined,
  enforceRateLimit: enforceApiRateLimit,
  getIo: () => getSocketServer(),
  joinViaInvite: (code, userId) => joinGroupViaInvite(code, userId),
  listParticipantIds: async (conversationId) => {
    const participants = await prisma.dMParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    return participants.map((participant) => participant.userId);
  },
  preview: (code, userId) => previewGroupInvite(code, userId),
  readInvite: (userId, conversationId) => readGroupInvite(userId, conversationId),
  rotateInvite: (userId, conversationId) => rotateGroupInvite(userId, conversationId),
  setInviteEnabled: (userId, conversationId, enabled) =>
    setGroupInviteEnabled(userId, conversationId, enabled),
};

/**
 * The mobile client ships on its own release train, so its bodies are re-parsed
 * against the shared schema before they leave: a server-side shape drift must
 * fail here, not on a phone that cannot be hot-fixed.
 */
async function parseResponse(
  response: Response,
  schema: { parse(value: unknown): unknown },
): Promise<Response> {
  if (response.status !== 200 && response.status !== 201) {
    return response;
  }

  return Response.json(schema.parse(await response.json()), { status: response.status });
}

function toMobileDependencies(
  dependencies: GroupInviteRouteDependencies,
  action: "dm:group:update" | "group-invite:preview" | "group-invite:join",
): GroupInviteRouteDependencies {
  return {
    ...dependencies,
    // Only the bucket is rewritten. `authenticate` is left as the caller
    // supplied it, because overriding it would re-authenticate an identity a
    // shell already resolved from the bearer token.
    enforceRateLimit: (userId) => dependencies.enforceRateLimit(userId, `mobile:${action}`),
  };
}

export async function mobileGroupInviteToggleRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = mobileGroupInviteDefaults,
): Promise<Response> {
  return await parseResponse(
    await groupInviteToggleRoute(
      request,
      conversationId,
      toMobileDependencies(dependencies, "dm:group:update"),
    ),
    GroupInviteResponseSchema,
  );
}

export async function mobileGroupInviteReadRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = mobileGroupInviteDefaults,
): Promise<Response> {
  return await parseResponse(
    await groupInviteReadRoute(
      request,
      conversationId,
      toMobileDependencies(dependencies, "dm:group:update"),
    ),
    GroupInviteResponseSchema,
  );
}

export async function mobileGroupInviteRotateRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = mobileGroupInviteDefaults,
): Promise<Response> {
  return await parseResponse(
    await groupInviteRotateRoute(
      request,
      conversationId,
      toMobileDependencies(dependencies, "dm:group:update"),
    ),
    GroupInviteResponseSchema,
  );
}

export async function mobileGroupInvitePreviewRoute(
  request: Request,
  code: string,
  dependencies: GroupInviteRouteDependencies = mobileGroupInviteDefaults,
): Promise<Response> {
  return await parseResponse(
    await groupInvitePreviewRoute(
      request,
      code,
      toMobileDependencies(dependencies, "group-invite:preview"),
    ),
    GroupInvitePreviewResponseSchema,
  );
}

/**
 * The join answers with a conversation DTO plus a flag, which no single shared
 * schema covers — `GroupDMConversationResponseSchema` is strict and would reject
 * `alreadyMember`. The response passes through unchanged.
 */
export async function mobileGroupInviteJoinRoute(
  request: Request,
  code: string,
  dependencies: GroupInviteRouteDependencies = mobileGroupInviteDefaults,
): Promise<Response> {
  return await groupInviteJoinRoute(
    request,
    code,
    toMobileDependencies(dependencies, "group-invite:join"),
  );
}
