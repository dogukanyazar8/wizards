import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { profileStatusRefetchInterval, type MobileBootstrapPayload } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { MOBILE_PERSISTED_QUERY_GC_TIME_MS } from "../query/mobile-query-cache-policy";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  patchMobileProfileIdentityCaches,
  patchMobileProfilePresenceCaches,
  restoreMobileProfilePresenceCaches,
} from "../query/mobile-profile-cache";
import {
  actOnMobileFriendRequest,
  blockMobileFriend,
  cancelMobileFriendRequest,
  createMobileFriendRequest,
  fetchMobileFriends,
  fetchMobileFriendSuggestions,
  fetchMobileUserProfile,
  normalizeMobileUserSearchTerm,
  openMobileFriendDM,
  removeMobileFriend,
  reportMobileUser,
  searchMobileUsers,
  unblockMobileFriend,
  updateMobilePresence,
  updateMobileProfile,
  MOBILE_USER_SEARCH_MIN_TERM_LENGTH,
  type MobileFriend,
  type MobileFriendPresenceStatus,
  type MobileFriendsOverview,
  type MobileProfileUpdate,
  type MobileUserReportReason,
  type MobileUserSearchResult,
} from "./mobile-social-client";

type MobileUserSearchRelationPatch = Pick<MobileUserSearchResult, "relationship" | "requestId">;

export function getMobileFriendsQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    // A persisted root pins its own retention: the default is half an hour now,
    // and a payload restored from disk that memory drops first is a restore the
    // reader pays for twice.
    gcTime: MOBILE_PERSISTED_QUERY_GC_TIME_MS,
    queryFn: () => fetchMobileFriends(client),
    queryKey: mobileQueryKeys.friends(),
    staleTime: 30_000,
  });
}

export function useMobileFriendsQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileFriendsQueryOptions(client, enabled));
}

/**
 * 1c suggestions. The list is derived from the social graph rather than written
 * to, so it survives a screen revisit without a refetch; every relationship
 * write below invalidates it, which is when it can actually change.
 */
export function getMobileFriendSuggestionsQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileFriendSuggestions(client),
    queryKey: mobileQueryKeys.friendSuggestions(),
    staleTime: 5 * 60_000,
  });
}

export function useMobileFriendSuggestionsQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileFriendSuggestionsQueryOptions(client, enabled));
}

export function getMobileUserSearchQueryOptions(
  client: MobileApiClient,
  term: string,
  enabled = true,
  /** Invite sheet 2b scopes results to one server, which widens the payload. */
  serverId?: string,
) {
  const normalized = normalizeMobileUserSearchTerm(term);
  return queryOptions({
    enabled: enabled && normalized.length >= MOBILE_USER_SEARCH_MIN_TERM_LENGTH,
    queryFn: () => searchMobileUsers(client, normalized, undefined, serverId),
    // Server context changes the payload, so a scoped search never reuses the
    // global cache entry for the same term.
    queryKey: mobileQueryKeys.userSearch(serverId ? `${normalized}@${serverId}` : normalized),
    staleTime: 15_000,
  });
}

/** Live "add friend" search; the caller owns the debounce so keystrokes do not thrash the cache. */
export function useMobileUserSearchQuery(
  client: MobileApiClient,
  term: string,
  enabled = true,
  serverId?: string,
) {
  return useQuery(getMobileUserSearchQueryOptions(client, term, enabled, serverId));
}

export function getMobileUserProfileQueryOptions(
  client: MobileApiClient,
  input: { enabled?: boolean; serverId?: string | undefined; userId: string },
) {
  return queryOptions({
    enabled: input.enabled ?? true,
    queryFn: () => fetchMobileUserProfile(client, input.userId, input.serverId),
    queryKey: mobileQueryKeys.userProfile(input.userId, input.serverId),
    refetchInterval: (query) =>
      profileStatusRefetchInterval(query.state.data?.presence.customStatusExpiresAt),
    // The card re-opens constantly from message rows; a short window keeps the
    // second open instant while still refetching on a real revisit.
    staleTime: 30_000,
  });
}

/** Backs the 11b quick card and the 11c full page from one cache entry. */
export function useMobileUserProfileQuery(
  client: MobileApiClient,
  input: { enabled?: boolean; serverId?: string | undefined; userId: string },
) {
  return useQuery(getMobileUserProfileQueryOptions(client, input));
}

/** An accepted request starts with a placeholder presence until the refetch returns the live one. */
function toOptimisticFriend(user: {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
}): MobileFriend {
  return {
    // Open until the refetch says otherwise: the placeholder must not make a
    // friend look closed to group invites for the second it is on screen.
    allowsGroupInvites: true,
    avatarUrl: user.avatarUrl,
    customStatus: null,
    // Activity is a server-side join; the refetch fills it in moments later.
    device: null,
    displayName: user.displayName,
    id: user.id,
    lastSeenAt: null,
    presence: { customStatus: null, status: "OFFLINE" },
    status: "OFFLINE",
    username: user.username,
    voiceRoom: null,
  };
}

function patchMobileFriendsOverview(
  queryClient: QueryClient,
  update: (current: MobileFriendsOverview) => MobileFriendsOverview,
): MobileFriendsOverview | undefined {
  const previous = queryClient.getQueryData<MobileFriendsOverview>(mobileQueryKeys.friends());
  if (previous) {
    queryClient.setQueryData<MobileFriendsOverview>(mobileQueryKeys.friends(), update(previous));
  }
  return previous;
}

function restoreMobileFriendsOverview(
  queryClient: QueryClient,
  previous: MobileFriendsOverview | undefined | null,
) {
  if (previous) {
    queryClient.setQueryData<MobileFriendsOverview>(mobileQueryKeys.friends(), previous);
  }
}

/** Every cached search term holds the same user row, so all of them move together. */
export function patchMobileUserSearchCaches(
  queryClient: QueryClient,
  userId: string,
  patch: MobileUserSearchRelationPatch,
) {
  queryClient.setQueriesData<{ results: MobileUserSearchResult[] }>(
    { queryKey: mobileQueryKeys.userSearchRoot() },
    (current) =>
      current
        ? {
            results: current.results.map((result) =>
              result.id === userId ? { ...result, ...patch } : result,
            ),
          }
        : current,
  );
}

function snapshotMobileUserSearchRelation(
  queryClient: QueryClient,
  userId: string,
): MobileUserSearchRelationPatch | null {
  for (const [, data] of queryClient.getQueriesData<{ results: MobileUserSearchResult[] }>({
    queryKey: mobileQueryKeys.userSearchRoot(),
  })) {
    const match = data?.results.find((result) => result.id === userId);
    if (match) {
      return { relationship: match.relationship, requestId: match.requestId };
    }
  }

  return null;
}

export function useMobileSocialMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();
  // Every relationship write also moves the profile card's button set, so the
  // two caches are refreshed together rather than left to drift.
  const refreshFriends = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.userProfileRoot() }),
      // Adding, accepting or blocking someone removes them from the suggestion
      // pool, so a stale list would keep offering a person already actioned.
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friendSuggestions() }),
    ]);
  const cancelFriendsQuery = () =>
    queryClient.cancelQueries({ queryKey: mobileQueryKeys.friends() });

  return {
    acceptRequest: useMutation({
      mutationFn: (input: { requestId: string; userId?: string }) =>
        actOnMobileFriendRequest(client, input.requestId, "accept"),
      onMutate: async (input) => {
        await cancelFriendsQuery();
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "friend",
            requestId: null,
          });
        }
        return patchMobileFriendsOverview(queryClient, (current) => {
          const accepted = current.pending.incoming.find((entry) => entry.id === input.requestId);
          const alreadyFriend =
            accepted && current.friends.some((friend) => friend.id === accepted.sender.id);
          return {
            ...current,
            friends:
              accepted && !alreadyFriend
                ? [toOptimisticFriend(accepted.sender), ...current.friends]
                : current.friends,
            pending: {
              ...current.pending,
              incoming: current.pending.incoming.filter((entry) => entry.id !== input.requestId),
            },
          };
        });
      },
      onError: (_error, input, previous) => {
        restoreMobileFriendsOverview(queryClient, previous);
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "incoming",
            requestId: input.requestId,
          });
        }
      },
      onSettled: refreshFriends,
    }),
    blockFriend: useMutation({
      mutationFn: (userId: string) => blockMobileFriend(client, userId),
      onSuccess: (_result, userId) =>
        patchMobileUserSearchCaches(queryClient, userId, {
          relationship: "blocked",
          requestId: null,
        }),
      onSettled: refreshFriends,
    }),
    cancelRequest: useMutation({
      mutationFn: (input: { requestId: string; userId?: string }) =>
        cancelMobileFriendRequest(client, input.requestId),
      onMutate: async (input) => {
        await cancelFriendsQuery();
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "none",
            requestId: null,
          });
        }
        return patchMobileFriendsOverview(queryClient, (current) => ({
          ...current,
          pending: {
            ...current.pending,
            outgoing: current.pending.outgoing.filter((entry) => entry.id !== input.requestId),
          },
        }));
      },
      onError: (_error, input, previous) => {
        restoreMobileFriendsOverview(queryClient, previous);
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "outgoing",
            requestId: input.requestId,
          });
        }
      },
      onSettled: refreshFriends,
    }),
    createRequest: useMutation({
      mutationFn: (input: { userId?: string; username: string }) =>
        createMobileFriendRequest(client, input.username),
      onMutate: (input) => {
        if (!input.userId) {
          return null;
        }

        const snapshot = snapshotMobileUserSearchRelation(queryClient, input.userId);
        patchMobileUserSearchCaches(queryClient, input.userId, {
          relationship: "outgoing",
          requestId: null,
        });
        return snapshot;
      },
      onError: (_error, input, snapshot) => {
        if (input.userId && snapshot) {
          patchMobileUserSearchCaches(queryClient, input.userId, snapshot);
        }
      },
      onSuccess: (result, input) => {
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "outgoing",
            requestId: result.request.id,
          });
        }
      },
      onSettled: refreshFriends,
    }),
    openDM: useMutation({
      mutationFn: (userId: string) => openMobileFriendDM(client, userId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
    }),
    reportUser: useMutation({
      mutationFn: (input: {
        details?: string | null;
        reason: MobileUserReportReason;
        userId: string;
      }) => reportMobileUser(client, input.userId, input),
    }),
    rejectRequest: useMutation({
      mutationFn: (input: { requestId: string; userId?: string }) =>
        actOnMobileFriendRequest(client, input.requestId, "reject"),
      onMutate: async (input) => {
        await cancelFriendsQuery();
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "none",
            requestId: null,
          });
        }
        return patchMobileFriendsOverview(queryClient, (current) => ({
          ...current,
          pending: {
            ...current.pending,
            incoming: current.pending.incoming.filter((entry) => entry.id !== input.requestId),
          },
        }));
      },
      onError: (_error, input, previous) => {
        restoreMobileFriendsOverview(queryClient, previous);
        if (input.userId) {
          patchMobileUserSearchCaches(queryClient, input.userId, {
            relationship: "incoming",
            requestId: input.requestId,
          });
        }
      },
      onSettled: refreshFriends,
    }),
    removeFriend: useMutation({
      mutationFn: (userId: string) => removeMobileFriend(client, userId),
      onSuccess: refreshFriends,
    }),
    unblockFriend: useMutation({
      mutationFn: (userId: string) => unblockMobileFriend(client, userId),
      onMutate: async (userId) => {
        await cancelFriendsQuery();
        return patchMobileFriendsOverview(queryClient, (current) => ({
          ...current,
          blocked: current.blocked.filter((entry) => entry.id !== userId),
        }));
      },
      onError: (_error, _userId, previous) => restoreMobileFriendsOverview(queryClient, previous),
      onSettled: refreshFriends,
    }),
    updatePresence: useMutation({
      mutationFn: (status: MobileFriendPresenceStatus) => updateMobilePresence(client, status),
      onMutate: async (status) => {
        await queryClient.cancelQueries({ queryKey: mobileQueryKeys.bootstrap() });
        const userId = queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())
          ?.user.id;
        return userId ? patchMobileProfilePresenceCaches({ queryClient, status, userId }) : null;
      },
      onError: (_error, _status, snapshot) => {
        if (snapshot) {
          restoreMobileProfilePresenceCaches(snapshot);
        }
      },
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
        ]);
      },
    }),
    updateProfile: useMutation({
      mutationFn: (input: MobileProfileUpdate) => updateMobileProfile(client, input),
      onSuccess: async (profile) => {
        patchMobileProfileIdentityCaches({ profile, queryClient });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.accountSettings() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.profile() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
        ]);
      },
    }),
  };
}
