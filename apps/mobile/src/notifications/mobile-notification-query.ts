import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import type { MobileNotificationFilter, MobileNotificationsResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  clearMobileNotifications,
  fetchMobileNotifications,
  markAllMobileNotificationsRead,
  markMobileNotificationRead,
} from "./mobile-notification-client";

export function getMobileNotificationsQueryOptions(
  client: MobileApiClient,
  filter: MobileNotificationFilter = "all",
) {
  return infiniteQueryOptions<
    MobileNotificationsResponse,
    Error,
    InfiniteData<MobileNotificationsResponse>,
    ReturnType<typeof mobileQueryKeys.notifications>,
    string | null
  >({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileNotifications(client, { cursor: pageParam, filter, limit: 20 }),
    queryKey: mobileQueryKeys.notifications(filter),
  });
}

export function useMobileNotificationsQuery(
  client: MobileApiClient,
  filter: MobileNotificationFilter = "all",
) {
  return useInfiniteQuery(getMobileNotificationsQueryOptions(client, filter));
}

type MobileNotificationMutationOptionsInput = {
  client: MobileApiClient;
  queryClient: QueryClient;
};

/** Every filtered feed hangs off the notifications root, so one prefix invalidation covers them all. */
function invalidateMobileNotifications(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: mobileQueryKeys.notificationsRoot(),
  });
}

export function createMobileNotificationMarkReadMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: (notificationId: string) => markMobileNotificationRead(client, notificationId),
    onSuccess: () => invalidateMobileNotifications(queryClient),
  };
}

export function createMobileNotificationMarkAllReadMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: () => markAllMobileNotificationsRead(client),
    onSuccess: () => invalidateMobileNotifications(queryClient),
  };
}

export function createMobileNotificationClearMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: () => clearMobileNotifications(client),
    onSuccess: () => invalidateMobileNotifications(queryClient),
  };
}

export function useMobileNotificationMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();
  return {
    clearAll: useMutation(createMobileNotificationClearMutationOptions({ client, queryClient })),
    markAllRead: useMutation(
      createMobileNotificationMarkAllReadMutationOptions({ client, queryClient }),
    ),
    markRead: useMutation(createMobileNotificationMarkReadMutationOptions({ client, queryClient })),
  };
}
