import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
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
  const refreshFriends = () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() });

  return {
    acceptRequest: useMutation({ mutationFn: (requestId: string) => actOnMobileFriendRequest(client, requestId, "accept"), onSuccess: refreshFriends }),
    blockFriend: useMutation({ mutationFn: (userId: string) => blockMobileFriend(client, userId), onSuccess: refreshFriends }),
    createRequest: useMutation({ mutationFn: (username: string) => createMobileFriendRequest(client, username), onSuccess: refreshFriends }),
    openDM: useMutation({
      mutationFn: (userId: string) => openMobileFriendDM(client, userId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
    }),
    rejectRequest: useMutation({ mutationFn: (requestId: string) => actOnMobileFriendRequest(client, requestId, "reject"), onSuccess: refreshFriends }),
    removeFriend: useMutation({ mutationFn: (userId: string) => removeMobileFriend(client, userId), onSuccess: refreshFriends }),
    unblockFriend: useMutation({ mutationFn: (userId: string) => unblockMobileFriend(client, userId), onSuccess: refreshFriends }),
    updatePresence: useMutation({
      mutationFn: (status: MobileFriendPresenceStatus) => updateMobilePresence(client, status),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
        ]);
      },
    }),
    updateProfile: useMutation({
      mutationFn: (input: { displayName?: string | null; username?: string }) => updateMobileProfile(client, input),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
          queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
        ]);
      },
    }),
  };
}
