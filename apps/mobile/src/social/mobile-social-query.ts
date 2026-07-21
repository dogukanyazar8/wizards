import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileBootstrapPayload } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  patchMobileProfileIdentityCaches,
  patchMobileProfilePresenceCaches,
  restoreMobileProfilePresenceCaches,
} from "../query/mobile-profile-cache";
import {
  actOnMobileFriendRequest,
  blockMobileFriend,
  createMobileFriendRequest,
  fetchMobileFriends,
  openMobileFriendDM,
  removeMobileFriend,
  unblockMobileFriend,
  updateMobilePresence,
  updateMobileProfile,
  type MobileFriendPresenceStatus,
} from "./mobile-social-client";

export function getMobileFriendsQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileFriends(client),
    queryKey: mobileQueryKeys.friends(),
    staleTime: 30_000,
  });
}

export function useMobileFriendsQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileFriendsQueryOptions(client, enabled));
}

export function useMobileSocialMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();
  const refreshFriends = () =>
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() });

  return {
    acceptRequest: useMutation({
      mutationFn: (requestId: string) => actOnMobileFriendRequest(client, requestId, "accept"),
      onSuccess: refreshFriends,
    }),
    blockFriend: useMutation({
      mutationFn: (userId: string) => blockMobileFriend(client, userId),
      onSuccess: refreshFriends,
    }),
    createRequest: useMutation({
      mutationFn: (username: string) => createMobileFriendRequest(client, username),
      onSuccess: refreshFriends,
    }),
    openDM: useMutation({
      mutationFn: (userId: string) => openMobileFriendDM(client, userId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
    }),
    rejectRequest: useMutation({
      mutationFn: (requestId: string) => actOnMobileFriendRequest(client, requestId, "reject"),
      onSuccess: refreshFriends,
    }),
    removeFriend: useMutation({
      mutationFn: (userId: string) => removeMobileFriend(client, userId),
      onSuccess: refreshFriends,
    }),
    unblockFriend: useMutation({
      mutationFn: (userId: string) => unblockMobileFriend(client, userId),
      onSuccess: refreshFriends,
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
      mutationFn: (input: {
        bio?: string | null;
        customStatus?: string | null;
        displayName?: string | null;
        username?: string;
      }) => updateMobileProfile(client, input),
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
