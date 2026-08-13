import { prisma } from "@wizards/db";
import type {
  MobileFriendDevice,
  MobileFriendSuggestion,
  MobileFriendVoiceRoom,
} from "@wizards/types";
import { MOBILE_FRIEND_SUGGESTION_LIMIT } from "@wizards/types";

import { canSendFriendRequest } from "@/lib/privacy-policy";
import { profileVisibilityWhereForViewer } from "@/lib/privacy/visibility-policy";
import { resolveVisibilityDecisions } from "@/lib/privacy/visibility-policy";
import { VOICE_HEARTBEAT_TIMEOUT_MS } from "@/lib/voice/types";

/**
 * Messaging redesign 1b/1c: the friends and requests tabs ask for three facts
 * the friends service never carried — where a friend is talking right now, what
 * they are signed in from, and what the viewer already shares with a stranger.
 *
 * These live outside `@/lib/friends/service` on purpose: the shared `FriendDto`
 * is also the web's contract, and the mobile list is the only surface that wants
 * these joins on every read.
 */

/**
 * A session heartbeats while the app is open, so a row that has gone quiet is
 * not evidence of a live device. Ten minutes is deliberately looser than the
 * presence TTL: a wrong "Mobil" line is worse than a missing one, but a
 * backgrounded phone should not lose its label the moment presence lapses.
 */
export const FRIEND_DEVICE_FRESHNESS_MS = 10 * 60 * 1000;

export type MobileFriendActivity = {
  readonly device: MobileFriendDevice | null;
  readonly voiceRoom: MobileFriendVoiceRoom | null;
};

const EMPTY_ACTIVITY: MobileFriendActivity = Object.freeze({ device: null, voiceRoom: null });

function toFriendDevice(clientType: string): MobileFriendDevice | null {
  if (clientType === "MOBILE" || clientType === "DESKTOP" || clientType === "WEB") {
    return clientType;
  }

  // `UNKNOWN` sessions carry a guessed client type; the row shows no device
  // rather than claiming one the client never identified.
  return null;
}

/**
 * Live voice room and signed-in device per friend. Both are best-effort: a
 * missing answer renders as "no extra line", never as a wrong one.
 */
export async function resolveMobileFriendActivity(
  viewerId: string,
  userIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, MobileFriendActivity>> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const [voiceStates, sessions, visibilityDecisions] = await Promise.all([
    prisma.voiceState.findMany({
      where: {
        userId: { in: uniqueUserIds },
        lastHeartbeat: { gte: new Date(now.getTime() - VOICE_HEARTBEAT_TIMEOUT_MS) },
      },
      select: {
        channel: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
        userId: true,
      },
    }),
    prisma.appSession.findMany({
      where: {
        userId: { in: uniqueUserIds },
        endedAt: null,
        lastSeenAt: { gte: new Date(now.getTime() - FRIEND_DEVICE_FRESHNESS_MS) },
      },
      select: { clientType: true, lastSeenAt: true, userId: true },
      orderBy: { lastSeenAt: "desc" },
    }),
    resolveVisibilityDecisions(viewerId, uniqueUserIds),
  ]);

  const voiceRoomByUserId = new Map<string, MobileFriendVoiceRoom>();
  for (const state of voiceStates) {
    voiceRoomByUserId.set(state.userId, {
      channelId: state.channel.id,
      channelName: state.channel.name,
      serverId: state.server.id,
      serverName: state.server.name,
    });
  }

  // Sessions arrive newest-first, so the first row per user is the freshest one.
  const deviceByUserId = new Map<string, MobileFriendDevice>();
  for (const session of sessions) {
    if (deviceByUserId.has(session.userId)) {
      continue;
    }
    const device = toFriendDevice(session.clientType);
    if (device) {
      deviceByUserId.set(session.userId, device);
    }
  }

  return new Map(
    uniqueUserIds.map((userId) => {
      if (!visibilityDecisions.get(userId)?.canViewPresence) {
        return [userId, EMPTY_ACTIVITY];
      }
      const device = deviceByUserId.get(userId) ?? null;
      const voiceRoom = voiceRoomByUserId.get(userId) ?? null;
      return [userId, device || voiceRoom ? { device, voiceRoom } : EMPTY_ACTIVITY];
    }),
  );
}

export type MobileFriendRequestContext = {
  readonly mutualFriendCount: number;
  readonly mutualServerCount: number;
  readonly mutualServerName: string | null;
  readonly viaUsername: string | null;
};

const EMPTY_REQUEST_CONTEXT: MobileFriendRequestContext = Object.freeze({
  mutualFriendCount: 0,
  mutualServerCount: 0,
  mutualServerName: null,
  viaUsername: null,
});

/** Every user the viewer is an accepted friend with. */
async function loadFriendIds(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.friendRequest.findMany({
    where: { status: "ACCEPTED", OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
    select: { receiverId: true, senderId: true },
  });

  return new Set(rows.map((row) => (row.senderId === viewerId ? row.receiverId : row.senderId)));
}

/** Every server the viewer is a member of, id -> name. */
async function loadViewerServers(viewerId: string): Promise<Map<string, string>> {
  const memberships = await prisma.serverMember.findMany({
    where: { userId: viewerId },
    select: { server: { select: { id: true, name: true } } },
  });

  return new Map(memberships.map((membership) => [membership.server.id, membership.server.name]));
}

/**
 * Which of the viewer's own servers a set of users also belong to.
 *
 * Scoped to the viewer's servers on purpose: the counterpart's other
 * memberships are none of the viewer's business, and the named server in the
 * 1c row is therefore always one the viewer can already see.
 */
async function loadMutualServers(
  viewerServers: Map<string, string>,
  userIds: readonly string[],
): Promise<Map<string, { count: number; name: string | null }>> {
  const result = new Map<string, { count: number; name: string | null }>();
  if (viewerServers.size === 0 || userIds.length === 0) {
    return result;
  }

  const rows = await prisma.serverMember.findMany({
    where: { serverId: { in: [...viewerServers.keys()] }, userId: { in: [...userIds] } },
    select: { serverId: true, userId: true },
  });

  for (const row of rows) {
    const current = result.get(row.userId) ?? { count: 0, name: null };
    result.set(row.userId, {
      count: current.count + 1,
      name: current.name ?? viewerServers.get(row.serverId) ?? null,
    });
  }

  return result;
}

/**
 * How many of the viewer's own friends each candidate is also friends with,
 * plus one of them by name for the "X aracılığıyla" line.
 *
 * The count is over the viewer's friends only, so it never reveals the size or
 * membership of a stranger's own friend list — and the named person is always
 * someone the viewer already knows.
 */
async function loadMutualFriends(
  viewerFriendIds: Set<string>,
  userIds: readonly string[],
): Promise<Map<string, { count: number; viaUserId: string | null }>> {
  const result = new Map<string, { count: number; viaUserId: string | null }>();
  if (viewerFriendIds.size === 0 || userIds.length === 0) {
    return result;
  }

  const friendIds = [...viewerFriendIds];
  const rows = await prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { senderId: { in: friendIds }, receiverId: { in: [...userIds] } },
        { senderId: { in: [...userIds] }, receiverId: { in: friendIds } },
      ],
    },
    select: { receiverId: true, senderId: true },
  });

  for (const row of rows) {
    const candidateId = viewerFriendIds.has(row.senderId) ? row.receiverId : row.senderId;
    const viaUserId = candidateId === row.senderId ? row.receiverId : row.senderId;
    // A pair of the viewer's own friends matches both arms of the OR; neither is
    // a candidate, so the row carries no information for this map.
    if (viewerFriendIds.has(candidateId)) {
      continue;
    }

    const current = result.get(candidateId) ?? { count: 0, viaUserId: null };
    result.set(candidateId, {
      count: current.count + 1,
      viaUserId: current.viaUserId ?? viaUserId,
    });
  }

  return result;
}

async function loadUsernames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter((id) => id.length > 0);
  if (ids.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });

  return new Map(users.map((user) => [user.id, user.username]));
}

/**
 * 1c secondary lines for a set of pending requests: "2 ortak sunucu · paycore"
 * and "selin_qa aracılığıyla". Keyed by the *counterpart* user id, so the caller
 * looks up whichever side of the request is not the viewer.
 */
export async function resolveMobileFriendRequestContext(
  viewerId: string,
  counterpartUserIds: readonly string[],
): Promise<Map<string, MobileFriendRequestContext>> {
  const userIds = [...new Set(counterpartUserIds)].filter((id) => id !== viewerId);
  if (userIds.length === 0) {
    return new Map();
  }

  const [viewerFriendIds, viewerServers] = await Promise.all([
    loadFriendIds(viewerId),
    loadViewerServers(viewerId),
  ]);
  const [mutualServers, mutualFriends] = await Promise.all([
    loadMutualServers(viewerServers, userIds),
    loadMutualFriends(viewerFriendIds, userIds),
  ]);

  const viaUsernames = await loadUsernames(
    [...mutualFriends.values()]
      .map((entry) => entry.viaUserId)
      .filter((id): id is string => Boolean(id)),
  );

  return new Map(
    userIds.map((userId) => {
      const servers = mutualServers.get(userId);
      const friends = mutualFriends.get(userId);
      if (!servers && !friends) {
        return [userId, EMPTY_REQUEST_CONTEXT];
      }

      return [
        userId,
        {
          mutualFriendCount: friends?.count ?? 0,
          mutualServerCount: servers?.count ?? 0,
          mutualServerName: servers?.name ?? null,
          viaUsername: friends?.viaUserId ? (viaUsernames.get(friends.viaUserId) ?? null) : null,
        },
      ];
    }),
  );
}

/** How many candidates to score before ranking; keeps the two scans bounded. */
const SUGGESTION_CANDIDATE_SCAN_LIMIT = 200;

/**
 * 1c "TANIYOR OLABİLİRSİN".
 *
 * Candidates come from two places the viewer can already see: friends of their
 * friends, and co-members of their own servers. A candidate is dropped when
 * *any* of these hold, so the list never surfaces someone the viewer has no
 * business being offered:
 *
 * - it is the viewer;
 * - a `FriendRequest` row already exists in either direction — that covers
 *   accepted friends, pending requests in both directions, declined requests,
 *   and blocks placed by either side;
 * - the account is a bot, a system user, banned, or soft-deleted;
 * - the candidate's own friend-request policy would reject the viewer. This is
 *   the switch people already use to control who may find them, so a `NOBODY`
 *   account never appears and a `MUTUAL_SERVERS` account only appears to
 *   someone who actually shares a server.
 */
export async function listMobileFriendSuggestions(
  viewerId: string,
  limit: number = MOBILE_FRIEND_SUGGESTION_LIMIT,
): Promise<MobileFriendSuggestion[]> {
  const take = Math.min(Math.max(1, Math.trunc(limit)), MOBILE_FRIEND_SUGGESTION_LIMIT);
  const [viewerFriendIds, viewerServers] = await Promise.all([
    loadFriendIds(viewerId),
    loadViewerServers(viewerId),
  ]);

  const friendIds = [...viewerFriendIds];
  const serverIds = [...viewerServers.keys()];

  const [friendOfFriendRows, coMemberRows, relationshipRows] = await Promise.all([
    friendIds.length === 0
      ? []
      : prisma.friendRequest.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ senderId: { in: friendIds } }, { receiverId: { in: friendIds } }],
          },
          select: { receiverId: true, senderId: true },
          take: SUGGESTION_CANDIDATE_SCAN_LIMIT,
        }),
    serverIds.length === 0
      ? []
      : prisma.serverMember.findMany({
          where: { serverId: { in: serverIds }, userId: { not: viewerId } },
          select: { userId: true },
          take: SUGGESTION_CANDIDATE_SCAN_LIMIT,
        }),
    // Any existing row in either direction disqualifies the candidate, so this
    // single read covers friends, pending requests, declines and blocks.
    prisma.friendRequest.findMany({
      where: { OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
      select: { receiverId: true, senderId: true },
    }),
  ]);

  const relatedUserIds = new Set(
    relationshipRows.map((row) => (row.senderId === viewerId ? row.receiverId : row.senderId)),
  );
  relatedUserIds.add(viewerId);

  const candidateIds = new Set<string>();
  for (const row of friendOfFriendRows) {
    for (const id of [row.senderId, row.receiverId]) {
      if (!relatedUserIds.has(id) && !viewerFriendIds.has(id)) {
        candidateIds.add(id);
      }
    }
  }
  for (const row of coMemberRows) {
    if (!relatedUserIds.has(row.userId) && !viewerFriendIds.has(row.userId)) {
      candidateIds.add(row.userId);
    }
  }

  if (candidateIds.size === 0) {
    return [];
  }

  const candidateIdList = [...candidateIds].slice(0, SUGGESTION_CANDIDATE_SCAN_LIMIT);
  const [candidates, mutualServers, mutualFriends] = await Promise.all([
    prisma.user.findMany({
      where: {
        AND: [
          profileVisibilityWhereForViewer(viewerId),
          {
            id: { in: candidateIdList },
            deletedAt: null,
            isBanned: false,
            isBot: false,
            isSystem: false,
          },
        ],
      },
      select: {
        avatarUrl: true,
        displayName: true,
        id: true,
        username: true,
        settings: { select: { friendRequestPolicy: true } },
      },
    }),
    loadMutualServers(viewerServers, candidateIdList),
    loadMutualFriends(viewerFriendIds, candidateIdList),
  ]);

  return candidates
    .map((candidate) => {
      const servers = mutualServers.get(candidate.id);
      const friends = mutualFriends.get(candidate.id);
      return {
        avatarUrl: candidate.avatarUrl,
        displayName: candidate.displayName,
        friendRequestPolicy: candidate.settings?.friendRequestPolicy ?? "EVERYONE",
        id: candidate.id,
        mutualFriendCount: friends?.count ?? 0,
        mutualServerCount: servers?.count ?? 0,
        mutualServerName: servers?.name ?? null,
        username: candidate.username,
      };
    })
    .filter(
      (candidate) =>
        // Nothing in common means nothing to show; the design's row always
        // states a reason ("4 ortak arkadaş" / "design-guild üyesi").
        (candidate.mutualFriendCount > 0 || candidate.mutualServerCount > 0) &&
        canSendFriendRequest(candidate.friendRequestPolicy, {
          haveMutualFriends: candidate.mutualFriendCount > 0,
          haveMutualServers: candidate.mutualServerCount > 0,
        }),
    )
    .sort(
      (first, second) =>
        second.mutualFriendCount - first.mutualFriendCount ||
        second.mutualServerCount - first.mutualServerCount ||
        first.username.localeCompare(second.username),
    )
    .slice(0, take)
    .map(({ friendRequestPolicy: _policy, ...suggestion }) => suggestion);
}
