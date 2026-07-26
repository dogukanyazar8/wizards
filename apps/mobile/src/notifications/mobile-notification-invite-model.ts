import type { MobileNotificationsResponse } from "@wizards/types";

/**
 * A targeted server invite lives in exactly one place for its recipient: the
 * notification row that offers accept/decline. Once it is answered the row has
 * nothing left to offer, so both outcomes retire it from every cached page.
 *
 * Kept pure so the "which rows go, and what happens to the unread count" rule
 * is tested directly rather than through a cache round-trip.
 */
export function removeMobileNotificationsByInviteCode(
  pages: readonly MobileNotificationsResponse[],
  code: string,
): MobileNotificationsResponse[] {
  return pages.map((page) => {
    const retained = page.notifications.filter(
      (notification) => notification.serverInviteCode !== code,
    );
    if (retained.length === page.notifications.length) {
      return page;
    }

    // Only rows that were still unread were counted, so the badge drops by
    // exactly those — never below zero.
    const removedUnread = page.notifications.filter(
      (notification) => notification.serverInviteCode === code && !notification.read,
    ).length;

    return {
      ...page,
      notifications: retained,
      unreadCount: Math.max(0, page.unreadCount - removedUnread),
    };
  });
}
