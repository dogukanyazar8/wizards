import { prisma, type Prisma } from "@wizards/db";
import { FRIEND_SUGGESTION_MAX, type FriendSuggestionDTO } from "@wizards/types";
import { profileVisibilityWhereForViewer } from "@/lib/privacy/visibility-policy";

/**
 * Mesajlar karar #8 — "Ortak sunuculardan öneriler" (SPEC §4).
 *
 * Öneri, görüntüleyenle **en az bir sunucuyu paylaşan** ve henüz arkadaşı
 * olmayan kişidir. Elemeler tek yerde ve hepsi sunucu tarafında: istemcinin
 * süzdüğü bir öneri listesi, engellediği birinin adını yine de ağdan geçirirdi.
 *
 * Presence **hiç dönmez**. Tasarımdaki öneri satırı durum noktası çizmiyor;
 * görünmemesini redaksiyona bırakmak yerine alanı hiç koymamak, görünürlük
 * ayarını yanlış uygulama ihtimalini tamamen kaldırır.
 */

export type FriendSuggestionsDependencies = {
  loadCandidates(input: {
    excludedUserIds: readonly string[];
    profileVisibilityWhere: Prisma.UserWhereInput;
    serverIds: readonly string[];
    viewerId: string;
  }): Promise<
    Array<{
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      memberships: Array<{ server: { memberCount: number; id: string; name: string } }>;
      username: string;
    }>
  >;
  loadExcludedUserIds(viewerId: string): Promise<string[]>;
  loadMutualFriendCounts(input: {
    candidateIds: readonly string[];
    viewerId: string;
  }): Promise<Map<string, number>>;
  loadViewerServerIds(viewerId: string): Promise<string[]>;
};

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return (
    parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toLocaleUpperCase("tr") || "?"
  );
}

const defaults: FriendSuggestionsDependencies = {
  loadViewerServerIds: async (viewerId) => {
    const memberships = await prisma.serverMember.findMany({
      where: { userId: viewerId },
      select: { serverId: true },
    });

    return memberships.map((membership) => membership.serverId);
  },

  /**
   * Önerilemeyecek herkes tek okumada: mevcut arkadaşlar, iki yönde bekleyen ya
   * da reddedilmiş istekler ve iki yönde engeller. `FriendRequest` üçünü de
   * taşıdığı için tek sorgu yeter.
   */
  loadExcludedUserIds: async (viewerId) => {
    const rows = await prisma.friendRequest.findMany({
      where: { OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
      select: { receiverId: true, senderId: true },
    });

    const excluded = new Set<string>([viewerId]);

    for (const row of rows) {
      excluded.add(row.senderId === viewerId ? row.receiverId : row.senderId);
    }

    return [...excluded];
  },

  loadCandidates: async ({ excludedUserIds, profileVisibilityWhere, serverIds, viewerId }) =>
    await prisma.user
      .findMany({
        where: {
          AND: [profileVisibilityWhere],
          id: { notIn: [...excludedUserIds, viewerId] },
          isBanned: false,
          isBot: false,
          deletedAt: null,
          serverMembers: { some: { serverId: { in: [...serverIds] } } },
          // 2b §7's neighbour: somebody who closed friend requests should not be
          // suggested as one. `NOBODY` is the only tier that means exactly that;
          // the two `MUTUAL_*` tiers are conditions this candidate may well meet,
          // and the request endpoint is the one that decides.
          settings: { is: { friendRequestPolicy: { not: "NOBODY" } } },
        },
        // A generous slice, then ordered in memory by mutual-friend count: the
        // ordering key is not a column, so the database cannot sort on it.
        take: FRIEND_SUGGESTION_MAX * 4,
        select: {
          avatarUrl: true,
          displayName: true,
          id: true,
          username: true,
          serverMembers: {
            where: { serverId: { in: [...serverIds] } },
            select: { server: { select: { id: true, memberCount: true, name: true } } },
          },
        },
      })
      .then((users) =>
        users.map((user) => ({
          avatarUrl: user.avatarUrl,
          displayName: user.displayName,
          id: user.id,
          memberships: user.serverMembers,
          username: user.username,
        })),
      ),

  /**
   * Aday başına bir sorgu **yok**: görüntüleyenin arkadaş kimlikleri bir kez
   * okunur, sonra tek bir `groupBy` her adayın kaç ortak arkadaşı olduğunu
   * verir.
   */
  loadMutualFriendCounts: async ({ candidateIds, viewerId }) => {
    if (candidateIds.length === 0) {
      return new Map();
    }

    const friendships = await prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: viewerId }, { receiverId: viewerId }],
      },
      select: { receiverId: true, senderId: true },
    });

    const viewerFriendIds = friendships.map((row) =>
      row.senderId === viewerId ? row.receiverId : row.senderId,
    );

    if (viewerFriendIds.length === 0) {
      return new Map();
    }

    const shared = await prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { senderId: { in: [...candidateIds] }, receiverId: { in: viewerFriendIds } },
          { receiverId: { in: [...candidateIds] }, senderId: { in: viewerFriendIds } },
        ],
      },
      select: { receiverId: true, senderId: true },
    });

    const candidateSet = new Set(candidateIds);
    const counts = new Map<string, number>();

    for (const row of shared) {
      const candidateId = candidateSet.has(row.senderId) ? row.senderId : row.receiverId;
      counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
    }

    return counts;
  },
};

export async function listFriendSuggestions(
  viewerId: string,
  dependencies: FriendSuggestionsDependencies = defaults,
): Promise<FriendSuggestionDTO[]> {
  const serverIds = await dependencies.loadViewerServerIds(viewerId);

  if (serverIds.length === 0) {
    return [];
  }

  const excludedUserIds = await dependencies.loadExcludedUserIds(viewerId);
  const candidates = await dependencies.loadCandidates({
    excludedUserIds,
    profileVisibilityWhere: profileVisibilityWhereForViewer(viewerId),
    serverIds,
    viewerId,
  });

  if (candidates.length === 0) {
    return [];
  }

  const mutualFriendCounts = await dependencies.loadMutualFriendCounts({
    candidateIds: candidates.map((candidate) => candidate.id),
    viewerId,
  });

  return candidates
    .map((candidate) => {
      const name = candidate.displayName ?? candidate.username;
      // The shared server with the most members, ties broken by id so two
      // requests never disagree about which one a suggestion "came through".
      const via = [...candidate.memberships]
        .map((membership) => membership.server)
        .sort(
          (left, right) => right.memberCount - left.memberCount || left.id.localeCompare(right.id),
        )[0];

      return {
        avatarUrl: candidate.avatarUrl,
        id: candidate.id,
        initials: toInitials(name),
        mutualFriendCount: mutualFriendCounts.get(candidate.id) ?? 0,
        name,
        username: candidate.username,
        viaServerName: via?.name ?? "",
      };
    })
    .sort(
      (left, right) =>
        right.mutualFriendCount - left.mutualFriendCount ||
        left.name.localeCompare(right.name, "tr"),
    )
    .slice(0, FRIEND_SUGGESTION_MAX);
}
