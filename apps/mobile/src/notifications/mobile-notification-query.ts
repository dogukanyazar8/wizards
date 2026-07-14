import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import type { MobileNotificationsResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  fetchMobileNotifications,
  markAllMobileNotificationsRead,
  markMobileNotificationRead,
} from "./mobile-notification-client";

export function getMobileNotificationsQueryOptions(client: MobileApiClient) {
  return infiniteQueryOptions<
    MobileNotificationsResponse,
    Error,
    InfiniteData<MobileNotificationsResponse>,
    ReturnType<typeof mobileQueryKeys.notifications>,
    string | null
  >({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMobileNotifications(client, { cursor: pageParam, limit: 20 }),
    queryKey: mobileQueryKeys.notifications(),
  });
}

export function useMobileNotificationsQuery(client: MobileApiClient) {
  return useInfiniteQuery(getMobileNotificationsQueryOptions(client));
}

type MobileNotificationMutationOptionsInput = {
  client: MobileApiClient;
  queryClient: QueryClient;
};

function invalidateMobileNotifications(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    exact: true,
    queryKey: mobileQueryKeys.notifications(),
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

export function useMobileNotificationMutations(client: MobileApiClient) {
  const queryClient = useQueryClient();
  return {
    markAllRead: useMutation(createMobileNotificationMarkAllReadMutationOptions({ client, queryClient })),
    markRead: useMutation(createMobileNotificationMarkReadMutationOptions({ client, queryClient })),
  };
}
