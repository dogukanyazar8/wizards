import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import {
  MobileNotificationEventKindSchema,
  type MobileNotificationEventKind,
  type MobileNotificationFilter,
  type MobileNotificationItem,
  type MobileNotificationNewEvent,
  type MobileNotificationsResponse,
} from "@wizards/types";

import { mobileQueryKeys } from "../query/mobile-query-keys";

const PREVIEW_MAX_LENGTH = 240;
/** Matches the invite-code bound in the notification contract. */
const INVITE_CODE_MAX_LENGTH = 96;

function getMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
  maxLength = 128,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function getEventKind(
  metadata: Record<string, unknown> | null,
): MobileNotificationEventKind | null {
  const parsed = MobileNotificationEventKindSchema.safeParse(
    getMetadataString(metadata, "eventKind", 64),
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Same shape the list endpoint returns, built from the socket event. Mirrors
 * `listMobileNotifications`: the quote comes from `messagePreview` with the older
 * `threadReplyPreview` as a fallback, and the friend-request id only survives on
 * a FRIEND_REQUEST row.
 */
export function toMobileNotificationItem(
  event: MobileNotificationNewEvent,
): MobileNotificationItem {
  const metadata = event.metadata ?? null;
  const messageId = getMetadataString(metadata, "messageId");
  const preview =
    getMetadataString(metadata, "messagePreview", PREVIEW_MAX_LENGTH) ??
    getMetadataString(metadata, "threadReplyPreview", PREVIEW_MAX_LENGTH);
  const friendRequestId = getMetadataString(metadata, "friendRequestId");
  // A pushed invite is live by construction — it was created moments ago — so
  // the row can offer accept/decline without waiting for the list refetch.
  const inviteCode = getMetadataString(metadata, "inviteCode", INVITE_CODE_MAX_LENGTH);

  return {
    actionUrl: event.actionUrl,
    actor: event.actor ?? null,
    body: event.body,
    channel: event.channel ?? null,
    createdAt: event.createdAt,
    eventKind: getEventKind(metadata),
    friendRequestId: event.type === "FRIEND_REQUEST" ? friendRequestId : null,
    id: event.id,
    messageQuote: messageId ? { id: messageId, preview } : null,
    read: event.read,
    readAt: event.readAt,
    server: event.server ?? null,
    serverInviteCode: event.type === "SERVER_INVITE" ? inviteCode : null,
    type: event.type,
  };
}

/**
 * An event can only be applied straight to the cache when it carries everything
 * the row draws. A mention whose actor could not be resolved would render with a
 * generic icon and then visibly swap to an avatar on the next fetch, so those
 * fall back to a refresh instead.
 */
export function canApplyMobileNotificationEvent(event: MobileNotificationNewEvent): boolean {
  const needsActor = event.type === "MENTION" || event.type === "DM";
  const needsChannel = event.type === "MENTION";

  if (needsActor && !event.actor) {
    return false;
  }

  return !needsChannel || Boolean(event.channel);
}

function matchesFilter(item: MobileNotificationItem, filter: MobileNotificationFilter): boolean {
  if (filter === "unread") {
    return !item.read;
  }

  if (filter === "mentions") {
    return item.type === "MENTION";
  }

  return true;
}

function prependNotification(
  current: InfiniteData<MobileNotificationsResponse> | undefined,
  item: MobileNotificationItem,
  filter: MobileNotificationFilter,
  unreadDelta: number,
): InfiniteData<MobileNotificationsResponse> | undefined {
  if (!current || current.pages.length === 0) {
    return current;
  }

  const [firstPage, ...restPages] = current.pages as [
    MobileNotificationsResponse,
    ...MobileNotificationsResponse[],
  ];
  // The row can already be there when a foreground backfill raced the socket.
  const isKnown = current.pages.some((page) =>
    page.notifications.some((notification) => notification.id === item.id),
  );
  const belongs = matchesFilter(item, filter);

  if (isKnown && unreadDelta === 0) {
    return current;
  }

  const unreadCount = Math.max(0, firstPage.unreadCount + unreadDelta);

  return {
    ...current,
    pages: [
      {
        ...firstPage,
        notifications:
          belongs && !isKnown ? [item, ...firstPage.notifications] : firstPage.notifications,
        unreadCount,
      },
      // Only the newest page carries the authoritative unread total; older pages
      // repeat a stale copy that nothing reads.
      ...restPages,
    ],
  };
}

/**
 * Writes a live notification into every cached feed. This is what removes the
 * debounce-then-refetch round trip from the open app: the badge and the row move
 * on the same frame the socket event lands.
 */
export function applyMobileRealtimeNotificationEvent(input: {
  event: MobileNotificationNewEvent;
  queryClient: QueryClient;
}): boolean {
  const { event, queryClient } = input;

  if (!canApplyMobileNotificationEvent(event)) {
    return false;
  }

  const item = toMobileNotificationItem(event);
  const unreadDelta = item.read ? 0 : 1;

  for (const filter of ["all", "unread", "mentions"] as const) {
    queryClient.setQueryData<InfiniteData<MobileNotificationsResponse>>(
      mobileQueryKeys.notifications(filter),
      (current) => prependNotification(current, item, filter, unreadDelta),
    );
  }

  return true;
}
