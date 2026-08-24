import { prisma } from "@wizards/db";
import type { DiscoverPersonPage, DiscoverPresence, FriendSuggestionDTO } from "@wizards/types";

import { toDiscoverInitials } from "@/lib/discover/identity";
import { listFriendSuggestions } from "@/lib/friends/suggestions-service";
import { readPresenceState, type VisiblePresenceStatus } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { getRedis } from "@/lib/redis";

export type DiscoverMutualServer = {
  id: string;
  memberCount: number;
  memberUserIds: string[];
  name: string;
  tags: string[];
};

export type DiscoverPeoplePresence = {
  hiddenUserIds: ReadonlySet<string>;
  statusByUserId: ReadonlyMap<string, VisiblePresenceStatus>;
};

export type DiscoverPeopleDependencies = {
  listFriendSuggestions(viewerId: string): Promise<FriendSuggestionDTO[]>;
  loadMutualServers(
    viewerId: string,
    candidateIds: readonly string[],
  ): Promise<DiscoverMutualServer[]>;
  loadPendingRequestTargetIds(
    viewerId: string,
    candidateIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  readPresence(viewerId: string, candidateIds: readonly string[]): Promise<DiscoverPeoplePresence>;
};

const defaultDependencies: DiscoverPeopleDependencies = {
  listFriendSuggestions,
  loadMutualServers: async (viewerId, candidateIds) => {
    if (candidateIds.length === 0) {
      return [];
    }

    const servers = await prisma.server.findMany({
      where: {
        AND: [
          { members: { some: { userId: viewerId } } },
          { members: { some: { userId: { in: [...candidateIds] } } } },
        ],
      },
      select: {
        id: true,
        memberCount: true,
        members: {
          where: { userId: { in: [...candidateIds] } },
          select: { userId: true },
        },
        name: true,
        tags: true,
      },
    });

    return servers.map((server) => ({
      id: server.id,
      memberCount: server.memberCount,
      memberUserIds: server.members.map((member) => member.userId),
      name: server.name,
      tags: server.tags,
    }));
  },
  loadPendingRequestTargetIds: async (viewerId, candidateIds) => {
    if (candidateIds.length === 0) {
      return new Set();
    }

    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: { in: [...candidateIds] },
        senderId: viewerId,
        status: "PENDING",
      },
      select: { receiverId: true },
    });

    return new Set(requests.map((request) => request.receiverId));
  },
  readPresence: async (viewerId, candidateIds) => {
    const ids = [...new Set(candidateIds.filter(Boolean))];
    const [presenceState, visibilityDecisions] = await Promise.all([
      readPresenceState(
        getRedis(),
        ids.map((userId) => ({ customStatus: null, status: "OFFLINE", userId })),
      ),
      resolveVisibilityDecisions(viewerId, ids),
    ]);
    const redacted = redactPresenceCollectionForViewer({
      decisions: visibilityDecisions,
      invisibleUserIds: presenceState.hiddenUserIds,
      lastSeenByUserId: new Map(),
      presenceByUserId: presenceState.presenceByUserId,
      subjectIds: ids,
    });

    return {
      hiddenUserIds: redacted.hiddenUserIds,
      statusByUserId: new Map(
        ids.map((userId) => [userId, redacted.presenceByUserId.get(userId)?.status ?? "OFFLINE"]),
      ),
    };
  },
};

export function rankDiscoverInterestTags(tagLists: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();

  for (const tags of tagLists) {
    for (const tag of new Set(tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(
      ([leftTag, leftCount], [rightTag, rightCount]) =>
        rightCount - leftCount || leftTag.localeCompare(rightTag, "tr"),
    )
    .slice(0, 2)
    .map(([tag]) => tag);
}

export function toDiscoverPresence(
  status: VisiblePresenceStatus,
  hidden: boolean,
): DiscoverPresence {
  if (hidden || status === "OFFLINE") {
    return "offline";
  }

  return status === "ONLINE" ? "online" : "idle";
}

function matchesDiscoverPerson(suggestion: FriendSuggestionDTO, query: string | undefined) {
  const term = query?.trim().toLocaleLowerCase("tr");
  if (!term) {
    return true;
  }

  return [suggestion.name, suggestion.username].some((value) =>
    value.toLocaleLowerCase("tr").includes(term),
  );
}

export async function listDiscoverPeople(
  viewerId: string,
  input: { query?: string },
  dependencies: DiscoverPeopleDependencies = defaultDependencies,
): Promise<DiscoverPersonPage> {
  const suggestions = (await dependencies.listFriendSuggestions(viewerId)).filter((suggestion) =>
    matchesDiscoverPerson(suggestion, input.query),
  );
  const candidateIds = suggestions.map((suggestion) => suggestion.id);

  if (candidateIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const [mutualServers, pendingTargetIds, presence] = await Promise.all([
    dependencies.loadMutualServers(viewerId, candidateIds),
    dependencies.loadPendingRequestTargetIds(viewerId, candidateIds),
    dependencies.readPresence(viewerId, candidateIds),
  ]);
  const serversByCandidateId = new Map<string, DiscoverMutualServer[]>();

  for (const server of mutualServers) {
    for (const userId of server.memberUserIds) {
      const servers = serversByCandidateId.get(userId) ?? [];
      servers.push(server);
      serversByCandidateId.set(userId, servers);
    }
  }

  return {
    items: suggestions.map((suggestion) => {
      const servers = serversByCandidateId.get(suggestion.id) ?? [];
      const largestServer = [...servers].sort(
        (left, right) => right.memberCount - left.memberCount || left.id.localeCompare(right.id),
      )[0];
      const status = presence.statusByUserId.get(suggestion.id) ?? "OFFLINE";

      return {
        avatarUrl: suggestion.avatarUrl,
        handle: suggestion.username,
        id: suggestion.id,
        initials: toDiscoverInitials(suggestion.name, null),
        interestTags: rankDiscoverInterestTags(servers.map((server) => server.tags)),
        mutualServerCount: servers.length,
        mutualServerName: largestServer?.name ?? null,
        name: suggestion.name,
        presence: toDiscoverPresence(status, presence.hiddenUserIds.has(suggestion.id)),
        requestSent: pendingTargetIds.has(suggestion.id),
      };
    }),
    nextCursor: null,
  };
}
