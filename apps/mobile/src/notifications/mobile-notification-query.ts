import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import type {
  MobileNotificationFilter,
  MobileNotificationItem,
  MobileNotificationsResponse,
} from "@wizards/types";
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

/**
 * The unread total only ever comes from the newest page: the server recounts it
 * on every request, so later pages carry a staler copy of the same number.
 */
export function getMobileNotificationUnreadCount(
  data: InfiniteData<MobileNotificationsResponse> | undefined,
): number {
  return data?.pages[0]?.unreadCount ?? 0;
}

/**
 * Feeds the bottom-tab badge. It shares the unfiltered feed's query key with the
 * notifications screen, so one fetch serves both and the realtime bridge's
 * notification invalidation moves the badge without any extra wiring.
 */
export function useMobileNotificationUnreadCount(
  client: MobileApiClient,
  enabled: boolean,
): number {
  const query = useInfiniteQuery({
    ...getMobileNotificationsQueryOptions(client, "all"),
    enabled,
  });

  return getMobileNotificationUnreadCount(query.data);
}

/**
 * Whether the account holds any notification at all, read from the unfiltered
 * feed rather than whichever tab is on screen. Global actions ("tümünü temizle")
 * must not take their enabled state from a filtered view: an empty mentions tab
 * is not an empty account, and an empty account is not an empty mentions tab.
 */
export function useMobileHasAnyNotification(client: MobileApiClient): boolean {
  const query = useInfiniteQuery(getMobileNotificationsQueryOptions(client, "all"));

  return (query.data?.pages[0]?.notifications.length ?? 0) > 0;
}

type MobileNotificationMutationOptionsInput = {
  client: MobileApiClient;
  queryClient: QueryClient;
};

/**
 * Every filtered feed hangs off the notifications root, so one prefix
 * invalidation covers them all.
 *
 * Bootstrap and workspace details go with it: reading or clearing a mention
 * retires `ChannelReadState.mentionCount` server-side. A single row carries its
 * server, so only that detail is stale; account-wide actions still invalidate
 * the workspace prefix because they can touch multiple servers.
 *
 * The DM inbox goes with them for the same reason: a DM row read or cleared here
 * retires `DMParticipant.unreadCount` server-side, and that sum is the only
 * source of the messages tab badge. Without this the badge keeps counting
 * notifications the user has already dealt with until the inbox happens to
 * refetch.
 */
function invalidateMobileNotifications(
  queryClient: QueryClient,
  workspace?: { exact: boolean; queryKey: QueryKey },
): void {
  // Invalidations are follow-up reconciliation. Returning their promise from
  // `onSuccess` kept mutation UI busy until every active refetch settled.
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notificationsRoot() }),
    queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() }),
    ...(workspace ? [queryClient.invalidateQueries(workspace)] : []),
    queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.dmConversations() }),
  ]);
}

export function createMobileNotificationMarkReadMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: (notification: MobileNotificationItem) =>
      markMobileNotificationRead(client, notification.id),
    onSuccess: (_data: void, notification: MobileNotificationItem) => {
      invalidateMobileNotifications(
        queryClient,
        notification.server
          ? { exact: true, queryKey: mobileQueryKeys.workspace(notification.server.id) }
          : undefined,
      );
    },
  };
}

export function createMobileNotificationMarkAllReadMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: () => markAllMobileNotificationsRead(client),
    onSuccess: () => {
      invalidateMobileNotifications(queryClient, {
        exact: false,
        queryKey: mobileQueryKeys.workspaceRoot(),
      });
    },
  };
}

export function createMobileNotificationClearMutationOptions({
  client,
  queryClient,
}: MobileNotificationMutationOptionsInput) {
  return {
    mutationFn: () => clearMobileNotifications(client),
    onSuccess: () => {
      invalidateMobileNotifications(queryClient, {
        exact: false,
        queryKey: mobileQueryKeys.workspaceRoot(),
      });
    },
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
