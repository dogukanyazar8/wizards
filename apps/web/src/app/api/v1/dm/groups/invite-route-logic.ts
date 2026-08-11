import {
  GroupInviteSettingsRequestSchema,
  isGroupInviteCode,
  type DMConversationDTO,
  type GroupInviteDTO,
  type GroupInvitePreviewDTO,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  emitGroupInviteChanged,
  emitGroupMemberJoined,
  type GroupRealtimeServer,
} from "@/lib/dm/group-realtime";
import {
  joinGroupViaInvite,
  previewGroupInvite,
  readGroupInvite,
  rotateGroupInvite,
  setGroupInviteEnabled,
} from "@/lib/dm/group-invite-service";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Faz 2 §B3. The four invite endpoints, plus the read the settings sheet needs
 * to show a link somebody else already switched on.
 *
 * Kept out of `route-logic.ts`: those routes all take a conversation and answer
 * with a conversation, and two of these take a bare code from somebody who is
 * not a member yet. Same reason `participant-route-logic.ts` is its own file.
 */

export type GroupInviteRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  emitInviteChanged: typeof emitGroupInviteChanged;
  emitMemberJoined: typeof emitGroupMemberJoined;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getIo(): GroupRealtimeServer | null;
  joinViaInvite(
    code: string,
    userId: string,
  ): Promise<{ alreadyMember: boolean; conversation: DMConversationDTO }>;
  /** Who to tell about the switch; the invite service does not load the roster. */
  listParticipantIds(conversationId: string): Promise<string[]>;
  preview(code: string, userId: string): Promise<GroupInvitePreviewDTO>;
  readInvite(userId: string, conversationId: string): Promise<GroupInviteDTO>;
  rotateInvite(userId: string, conversationId: string): Promise<GroupInviteDTO>;
  setInviteEnabled(
    userId: string,
    conversationId: string,
    enabled: boolean,
  ): Promise<GroupInviteDTO>;
};

const defaults: GroupInviteRouteDependencies = {
  authenticate: () => requireApiUserId(),
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
 * A code that cannot exist is a 404 with no query behind it. That is the cheap
 * half of the rate limit: a scripted guessing run never reaches the database.
 */
function assertInviteCode(code: string): void {
  if (!isGroupInviteCode(code)) {
    throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
  }
}

async function announceInvite(
  conversationId: string,
  invite: GroupInviteDTO,
  dependencies: GroupInviteRouteDependencies,
): Promise<void> {
  const io = dependencies.getIo();

  if (!io) {
    return;
  }

  dependencies.emitInviteChanged(io, {
    conversationId,
    enabled: invite.enabled,
    participantUserIds: await dependencies.listParticipantIds(conversationId),
  });
}

/** B3. `editInfo`. The first switch-on is what mints the code. */
export async function groupInviteToggleRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const { enabled } = await parseJsonBody(request, GroupInviteSettingsRequestSchema);
    const invite = await dependencies.setInviteEnabled(userId, conversationId, enabled);

    await announceInvite(conversationId, invite, dependencies);

    return Response.json({ invite });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * The settings sheet's read. Membership only: `editInfo` governs changing the
 * link, and a member who cannot read one an admin already published would have
 * no way to share the group at all.
 */
export async function groupInviteReadRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");

    return Response.json({ invite: await dependencies.readInvite(userId, conversationId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** B3. `editInfo`. New code, counter reset, old code dead. */
export async function groupInviteRotateRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupInviteRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const invite = await dependencies.rotateInvite(userId, conversationId);

    await announceInvite(conversationId, invite, dependencies);

    return Response.json({ invite });
  } catch (error) {
    return jsonError(error);
  }
}

/** B3. Session required, membership not. Never returns the roster. */
export async function groupInvitePreviewRoute(
  request: Request,
  code: string,
  dependencies: GroupInviteRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "group-invite:preview");
    assertInviteCode(code);

    return Response.json({ preview: await dependencies.preview(code, userId) });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * B3. The redemption. Every failure keeps its own status so the page can say
 * which of the eight branches it hit rather than "bir sorun oluştu".
 */
export async function groupInviteJoinRoute(
  request: Request,
  code: string,
  dependencies: GroupInviteRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "group-invite:join");
    assertInviteCode(code);

    const { alreadyMember, conversation } = await dependencies.joinViaInvite(code, userId);
    const io = dependencies.getIo();

    // Nobody's roster changed on an "already a member" answer, so there is
    // nothing to announce — a broadcast would only make every open client
    // re-render.
    if (io && !alreadyMember) {
      dependencies.emitMemberJoined(io, { conversation, userId });
    }

    return Response.json({ alreadyMember, conversation });
  } catch (error) {
    return jsonError(error);
  }
}
