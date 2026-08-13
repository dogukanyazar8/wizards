import { prisma } from "@wizards/db";
import type { NotificationType, Prisma } from "@wizards/db";
import {
  BadgeIdSchema,
  type MobileNotificationsQuery,
  type MobileNotificationsResponse,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { isLiveInvite } from "@/lib/workspace/invite-selection";
import { emitServerUnreadUpdatesToUser } from "@/lib/workspace/unread-service";
import type { NotificationDTO } from "./types";

type NotificationRow = Prisma.NotificationGetPayload<{
  select: {
    id: true;
    type: true;
    body: true;
    actionUrl: true;
    readAt: true;
    createdAt: true;
    metadata: true;
  };
}>;

type UserRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    username: true;
    displayName: true;
    avatarUrl: true;
  };
}>;

const VISIBLE_NOTIFICATION_TYPES: NotificationType[] = [
  "BADGE",
  "FEEDBACK",
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "DM",
  "MENTION",
  "SERVER_INVITE",
  "SYSTEM",
  "MODERATION",
];

export function getMobileVisibleNotificationTypes(options: {
  badgeCapable: boolean;
}): NotificationType[] {
  return options.badgeCapable
    ? [...VISIBLE_NOTIFICATION_TYPES]
    : VISIBLE_NOTIFICATION_TYPES.filter((type) => type !== "BADGE");
}

type VisibleNotificationType =
  | "BADGE"
  | "FEEDBACK"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "DM"
  | "MENTION"
  | "MODERATION"
  | "SERVER_INVITE"
  | "SYSTEM";

type MobileNotificationCursor = {
  createdAt: Date;
  id: string;
};

type MobileNotificationMetadata = Record<string, unknown>;

const MOBILE_NOTIFICATION_EVENT_KINDS = [
  "message-reaction",
  "server-member-joined",
  "voice-room-started",
] as const;

type MobileNotificationEventKind = (typeof MOBILE_NOTIFICATION_EVENT_KINDS)[number];

function getNotificationMetadataString(
  metadata: MobileNotificationMetadata,
  key: string,
  maxLength = 128,
) {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function getMobileNotificationEventKind(
  metadata: MobileNotificationMetadata,
): MobileNotificationEventKind | null {
  const eventKind = getNotificationMetadataString(metadata, "eventKind", 64);
  return MOBILE_NOTIFICATION_EVENT_KINDS.includes(eventKind as MobileNotificationEventKind)
    ? (eventKind as MobileNotificationEventKind)
    : null;
}

function encodeMobileNotificationCursor(cursor: MobileNotificationCursor) {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

function decodeMobileNotificationCursor(cursor: string): MobileNotificationCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid cursor payload");
    }
    const { createdAt, id } = parsed as { createdAt?: unknown; id?: unknown };
    const date = typeof createdAt === "string" ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime()) || typeof id !== "string" || id.length === 0) {
      throw new Error("invalid cursor fields");
    }
    return { createdAt: date, id };
  } catch {
    throw new ApiError("Invalid notification cursor", 400, "INVALID_CURSOR");
  }
}

export async function listMobileNotifications(
  userId: string,
  query: MobileNotificationsQuery,
  options: { badgeCapable: boolean } = { badgeCapable: false },
): Promise<MobileNotificationsResponse> {
  const visibleTypes = getMobileVisibleNotificationTypes(options);
  const cursor = query.cursor ? decodeMobileNotificationCursor(query.cursor) : null;
  const filterWhere =
    query.filter === "unread"
      ? { read: false }
      : query.filter === "mentions"
        ? { type: "MENTION" as const }
        : {};
  const records = await prisma.notification.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      actionUrl: true,
      body: true,
      createdAt: true,
      id: true,
      metadata: true,
      read: true,
      readAt: true,
      type: true,
    },
    take: query.limit + 1,
    where: {
      type: { in: visibleTypes },
      userId,
      ...filterWhere,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
  });
  const hasNextPage = records.length > query.limit;
  const notifications = hasNextPage ? records.slice(0, query.limit) : records;
  const metadata = notifications.map(
    (notification) => (notification.metadata as MobileNotificationMetadata | null) ?? {},
  );
  const senderIds = metadata
    .map((value) => getNotificationMetadataString(value, "senderId"))
    .filter((id): id is string => id !== null);
  const channelIds = metadata
    .map((value) => getNotificationMetadataString(value, "channelId"))
    .filter((id): id is string => id !== null);

  const inviteCodes = metadata
    .map((value) => getNotificationMetadataString(value, "inviteCode", 96))
    .filter((code): code is string => code !== null);
  const [users, channels, unreadCount, openInvites] = await Promise.all([
    prisma.user.findMany({
      select: { avatarUrl: true, displayName: true, id: true, username: true },
      where: { id: { in: senderIds } },
    }),
    prisma.channel.findMany({
      select: { id: true, name: true, serverId: true },
      where: { id: { in: channelIds } },
    }),
    prisma.notification.count({
      where: { read: false, type: { in: visibleTypes }, userId },
    }),
    inviteCodes.length === 0
      ? []
      : prisma.serverInvite.findMany({
          select: { code: true, expiresAt: true, maxUses: true, uses: true },
          where: { code: { in: inviteCodes }, targetUserId: userId },
        }),
  ]);
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const serverIds = metadata
    .map((value) => getNotificationMetadataString(value, "serverId"))
    .concat(channels.map((channel) => channel.serverId))
    .filter((id): id is string => id !== null);
  const servers = await prisma.server.findMany({
    select: { id: true, name: true },
    where: { id: { in: serverIds } },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));
  const serverMap = new Map(servers.map((server) => [server.id, server]));

  // A SERVER_INVITE row only offers accept/decline while its invite is still
  // redeemable by this user, so the codes are checked against the live rows
  // rather than trusted from the notification's own metadata.
  const now = Date.now();
  const openInviteCodes = new Set(
    openInvites.filter((invite) => isLiveInvite(invite, now)).map((invite) => invite.code),
  );

  return {
    nextCursor:
      hasNextPage && notifications.length > 0
        ? encodeMobileNotificationCursor(notifications[notifications.length - 1]!)
        : null,
    unreadCount,
    notifications: notifications.map((notification, index) => {
      const notificationMetadata = metadata[index]!;
      const senderId = getNotificationMetadataString(notificationMetadata, "senderId");
      const channelId = getNotificationMetadataString(notificationMetadata, "channelId");
      const serverId =
        getNotificationMetadataString(notificationMetadata, "serverId") ??
        (channelId ? (channelMap.get(channelId)?.serverId ?? null) : null);
      const messageId = getNotificationMetadataString(notificationMetadata, "messageId");
      // `messagePreview` is the mention's own text; `threadReplyPreview` predates
      // it and still backs thread replies, so both feed the same quote line.
      const preview =
        getNotificationMetadataString(notificationMetadata, "messagePreview", 240) ??
        getNotificationMetadataString(notificationMetadata, "threadReplyPreview", 240);
      const eventKind = getMobileNotificationEventKind(notificationMetadata);
      const friendRequestId = getNotificationMetadataString(
        notificationMetadata,
        "friendRequestId",
      );
      const inviteCode = getNotificationMetadataString(notificationMetadata, "inviteCode", 96);
      const badgeId = BadgeIdSchema.safeParse(
        getNotificationMetadataString(notificationMetadata, "badgeId", 64),
      );
      const actor = senderId ? (userMap.get(senderId) ?? null) : null;
      const channel = channelId ? (channelMap.get(channelId) ?? null) : null;
      const server = serverId ? (serverMap.get(serverId) ?? null) : null;

      return {
        actionUrl: notification.actionUrl,
        actor: actor
          ? {
              avatarUrl: actor.avatarUrl,
              displayName: actor.displayName,
              id: actor.id,
              username: actor.username,
            }
          : null,
        // Only a BADGE row carries one, the same per-type narrowing
        // `friendRequestId` and `serverInviteCode` below apply.
        badgeId: notification.type === "BADGE" && badgeId.success ? badgeId.data : null,
        body: notification.body,
        channel: channel ? { id: channel.id, name: channel.name } : null,
        createdAt: notification.createdAt.toISOString(),
        eventKind,
        friendRequestId: notification.type === "FRIEND_REQUEST" ? friendRequestId : null,
        id: notification.id,
        messageQuote: messageId ? { id: messageId, preview } : null,
        read: notification.read,
        readAt: notification.readAt?.toISOString() ?? null,
        server: server ? { id: server.id, name: server.name } : null,
        serverInviteCode:
          notification.type === "SERVER_INVITE" && inviteCode && openInviteCodes.has(inviteCode)
            ? inviteCode
            : null,
        type: notification.type as VisibleNotificationType,
      };
    }),
  };
}

export async function listNotifications(userId: string, limit: number): Promise<NotificationDTO[]> {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: VISIBLE_NOTIFICATION_TYPES },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      body: true,
      actionUrl: true,
      readAt: true,
      createdAt: true,
      metadata: true,
    },
  });

  const senderIds = notifications
    .map((n) => {
      const meta = (n.metadata as Record<string, unknown>) ?? {};
      return (meta.senderId as string) || null;
    })
    .filter((id): id is string => id !== null);

  const users = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return notifications.map((n): NotificationDTO => {
    const meta = (n.metadata as Record<string, unknown>) ?? {};
    const senderId = (meta.senderId as string) || "";
    const actor = userMap.get(senderId) ?? null;

    return {
      id: n.id,
      type: n.type as VisibleNotificationType,
      actor: actor
        ? {
            id: actor.id,
            username: actor.username,
            displayName: actor.displayName,
            avatarUrl: actor.avatarUrl,
          }
        : null,
      message: n.body,
      actionUrl: n.actionUrl,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      meta: (meta as Record<string, string>) || undefined,
    };
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const count = await prisma.notification.count({
    where: {
      userId,
      read: false,
      type: { in: VISIBLE_NOTIFICATION_TYPES },
    },
  });

  return count;
}

function getNotificationChannelScope(
  metadata: Prisma.JsonValue | null,
): { channelId: string; serverId: string | null } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const channelId = typeof record.channelId === "string" ? record.channelId : null;
  if (!channelId) {
    return null;
  }

  return {
    channelId,
    serverId: typeof record.serverId === "string" ? record.serverId : null,
  };
}

function getNotificationConversationId(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const conversationId = (metadata as Record<string, unknown>).conversationId;
  return typeof conversationId === "string" && conversationId.length > 0 ? conversationId : null;
}

function isDirectMessageMention(metadata: Prisma.JsonValue | null): boolean {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).mentioned === true,
  );
}

function scheduleServerUnreadUpdates(userId: string, serverIds: Iterable<string>): void {
  const uniqueServerIds = Array.from(new Set(serverIds)).filter(Boolean);
  if (uniqueServerIds.length === 0) {
    return;
  }

  // Bulk feed actions used to start one multi-query fan-out per server and
  // silently discard every rejection. One batched read keeps query volume
  // bounded; logging preserves the evidence when the background emit fails.
  void emitServerUnreadUpdatesToUser(userId, uniqueServerIds).catch((error) => {
    logError("notification_unread_fanout", error);
  });
}

/**
 * A mention lives in two places: the notification row and the channel's mention
 * badge. Reading it in the notification feed has to retire both, otherwise the
 * servers screen, the switcher sheet and the channel row keep the badge for a
 * mention the user has already dealt with. `gt: 0` keeps the counter from ever
 * going negative when the same row is marked read twice.
 */
async function releaseChannelMention(
  userId: string,
  scope: { channelId: string; serverId: string | null },
): Promise<void> {
  await prisma.channelReadState.updateMany({
    where: { channelId: scope.channelId, mentionCount: { gt: 0 }, userId },
    data: { mentionCount: { decrement: 1 } },
  });

  if (scope.serverId) {
    scheduleServerUnreadUpdates(userId, [scope.serverId]);
  }
}

/** Clears every mention badge the user owns, for the bulk read/clear actions. */
async function releaseAllChannelMentions(userId: string): Promise<void> {
  const affected = await prisma.channelReadState.findMany({
    where: { mentionCount: { gt: 0 }, userId },
    select: { channel: { select: { serverId: true } } },
  });

  if (affected.length === 0) {
    return;
  }

  await prisma.channelReadState.updateMany({
    where: { mentionCount: { gt: 0 }, userId },
    data: { mentionCount: 0 },
  });

  const serverIds = new Set(
    affected
      .map((state) => state.channel?.serverId)
      .filter((serverId): serverId is string => Boolean(serverId)),
  );
  scheduleServerUnreadUpdates(userId, serverIds);
}

/**
 * A DM notification has the same two homes a mention does: the notification row
 * and `DMParticipant.unreadCount`, which is the sole source of the messages tab
 * badge (`getDirectMessageUnreadCount` sums it). Reading the row in the feed has
 * to retire its share of the badge, otherwise the tab keeps counting a message
 * the user has already dealt with.
 *
 * `lastReadAt` is deliberately untouched: it is what the sender's read tick is
 * drawn from, and clearing a notification is not reading the conversation.
 * `gt: 0` keeps the counter from going negative.
 */
async function releaseDirectMessageUnread(
  userId: string,
  conversationId: string,
  mentioned: boolean,
): Promise<void> {
  await prisma.dMParticipant.updateMany({
    where: {
      conversationId,
      ...(mentioned ? { mentionCount: { gt: 0 } } : {}),
      unreadCount: { gt: 0 },
      userId,
    },
    data: {
      ...(mentioned ? { mentionCount: { decrement: 1 } } : {}),
      unreadCount: { decrement: 1 },
    },
  });
}

async function listUnreadDirectMessageConversationIds(userId: string): Promise<string[]> {
  const notifications = await prisma.notification.findMany({
    where: { read: false, type: "DM", userId },
    select: { metadata: true },
  });

  return Array.from(
    new Set(
      notifications
        .map((notification) => getNotificationConversationId(notification.metadata))
        .filter((conversationId): conversationId is string => Boolean(conversationId)),
    ),
  );
}

/** Clears only DM badges backed by rows the bulk action actually consumes. */
async function releaseAllDirectMessageUnread(
  userId: string,
  conversationIds: string[],
): Promise<void> {
  if (conversationIds.length === 0) {
    return;
  }

  await prisma.dMParticipant.updateMany({
    // Muted conversations can have unread counters but no notification row.
    // A feed-wide action must not erase state it never showed the user.
    where: { conversationId: { in: conversationIds }, userId },
    data: { mentionCount: 0, unreadCount: 0 },
  });
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { metadata: true, type: true },
  });

  if (!notification) {
    throw new ApiError("Notification not found", 404);
  }

  const { count } = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      // The guard belongs to the write. Two callers may both observe the row,
      // but only the winner may retire its badge counters.
      read: false,
      userId,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  if (count !== 1) {
    return;
  }

  if (notification.type === "MENTION") {
    const scope = getNotificationChannelScope(notification.metadata);
    if (scope) {
      await releaseChannelMention(userId, scope);
    }
    return;
  }

  if (notification.type === "DM") {
    const conversationId = getNotificationConversationId(notification.metadata);
    if (conversationId) {
      await releaseDirectMessageUnread(
        userId,
        conversationId,
        isDirectMessageMention(notification.metadata),
      );
    }
  }
}

/** Mirrors the web "clear all" action: drops the user's whole notification feed. */
export async function clearNotifications(userId: string): Promise<void> {
  const conversationIds = await listUnreadDirectMessageConversationIds(userId);
  await prisma.notification.deleteMany({ where: { userId } });
  await releaseAllChannelMentions(userId);
  await releaseAllDirectMessageUnread(userId, conversationIds);
}

export async function markAllRead(userId: string): Promise<void> {
  const conversationIds = await listUnreadDirectMessageConversationIds(userId);
  await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
  await releaseAllChannelMentions(userId);
  await releaseAllDirectMessageUnread(userId, conversationIds);
}

export async function serializeNotificationToDTO(
  notification: NotificationRow,
  userMap: Map<string, UserRow>,
): Promise<NotificationDTO> {
  const meta = (notification.metadata as Record<string, unknown>) ?? {};
  const senderId = (meta.senderId as string) || "";
  const actor = userMap.get(senderId) ?? null;

  return {
    id: notification.id,
    type: notification.type as VisibleNotificationType,
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          displayName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        }
      : null,
    message: notification.body,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    meta: (meta as Record<string, string>) || undefined,
  };
}
