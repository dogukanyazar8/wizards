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
 * Bootstrap and the workspace details go with it: reading or clearing a mention
 * now retires the matching `ChannelReadState.mentionCount` server-side, so the
 * servers screen, the switcher sheet and the channel row are all holding numbers
 * that just changed. Both are prefix invalidations — every cached server has to
 * catch up, not only the one on screen.
 *
 * The DM inbox goes with them for the same reason: a DM row read or cleared here
 * retires `DMParticipant.unreadCount` server-side, and that sum is the only
 * source of the messages tab badge. Without this the badge keeps counting
 * notifications the user has already dealt with until the inbox happens to
 * refetch.
 */
function invalidateMobileNotifications(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notificationsRoot() }),
    queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() }),
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.workspaceRoot() }),
    queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.dmConversations() }),
  ]);
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
