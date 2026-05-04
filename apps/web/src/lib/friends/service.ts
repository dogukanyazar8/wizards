import type Redis from "ioredis";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getRedis } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { getBlockStatus, getFriendship } from "@/lib/friends/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSocketServer } from "@/lib/socket/runtime";
import { logError } from "@/lib/logger";
import type {
  BlockStatus,
  FriendDto,
  FriendPresenceStatus,
  FriendPresenceUpdateDto,
  FriendRequestDto,
  FriendStatusDto,
  FriendUserDto,
  PendingFriendsResponse,
} from "@/lib/friends/types";

const friendUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const friendRequestInclude = {
  sender: { select: friendUserSelect },
  receiver: { select: friendUserSelect },
} as const;

const notificationUserSelect = {
  ...friendUserSelect,
  locale: true,
} as const;

const friendListUserSelect = {
  ...friendUserSelect,
  customStatus: true,
} as const;

const FRIEND_PRESENCE_STATUSES = [
  "ONLINE",
  "IDLE",
  "DND",
  "OFFLINE",
  "INVISIBLE",
] as const;

type RedisPresenceStatus = (typeof FRIEND_PRESENCE_STATUSES)[number];

type FriendRequestRecord = {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sender: FriendUserDto;
  receiver: FriendUserDto;
};

type NotificationUserRecord = FriendUserDto & {
  locale: string;
};

type FriendListUserRecord = FriendUserDto & {
  customStatus: string | null;
};

type PresenceFields = Pick<FriendDto, "customStatus" | "status">;
type FriendsUpdatedReason =
  | "blocked"
  | "friend_request_accepted"
  | "friend_request_canceled"
  | "friend_request_received"
  | "friend_request_rejected"
  | "friend_removed"
  | "unblocked";

function isPresenceStatus(value: string): value is RedisPresenceStatus {
  return FRIEND_PRESENCE_STATUSES.includes(value as RedisPresenceStatus);
}

function normalizePresenceStatus(value: unknown): RedisPresenceStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return isPresenceStatus(normalized) ? normalized : null;
}

function toVisiblePresenceStatus(status: RedisPresenceStatus | null): FriendPresenceStatus | null {
  if (!status) {
    return null;
  }

  return status === "INVISIBLE" ? "OFFLINE" : status;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePresenceRecord(
  record: Record<string, unknown>,
  fallback: PresenceFields,
): PresenceFields {
  const customStatus = normalizeNullableString(record.customStatus);
  const customStatusSnake = normalizeNullableString(record.custom_status);

  return {
    status:
      toVisiblePresenceStatus(normalizePresenceStatus(record.status)) ??
      toVisiblePresenceStatus(normalizePresenceStatus(record.presence)) ??
      fallback.status,
    customStatus:
      customStatus !== undefined
        ? customStatus
        : customStatusSnake !== undefined
          ? customStatusSnake
          : fallback.customStatus,
  };
}

function parsePresencePayload(rawValue: string | null, fallback: PresenceFields): PresenceFields {
  if (!rawValue) {
    return fallback;
  }

  const directStatus = normalizePresenceStatus(rawValue);
  if (directStatus) {
    return {
      ...fallback,
      status: toVisiblePresenceStatus(directStatus) ?? fallback.status,
    };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isRecord(parsed)) {
      return parsePresenceRecord(parsed, fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function readPresence(
  redis: Redis,
  userId: string,
  fallback: PresenceFields,
): Promise<PresenceFields> {
  const key = `presence:${userId}`;

  try {
    const keyType = await redis.type(key);

    if (keyType === "string") {
      return parsePresencePayload(await redis.get(key), fallback);
    }

    if (keyType === "hash") {
      return parsePresenceRecord(await redis.hgetall(key), fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function getPresenceRedisKey(userId: string) {
  return `presence:${userId}`;
}

function toFriendStatusDto(status: string): FriendStatusDto {
  if (
    status === "PENDING" ||
    status === "ACCEPTED" ||
    status === "DECLINED" ||
    status === "BLOCKED"
  ) {
    return status;
  }

  return "PENDING";
}

function toFriendUserDto(user: FriendUserDto): FriendUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function toFriendRequestDto(request: FriendRequestRecord): FriendRequestDto {
  return {
    id: request.id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    status: toFriendStatusDto(request.status),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    sender: toFriendUserDto(request.sender),
    receiver: toFriendUserDto(request.receiver),
  };
}

function getDisplayName(user: FriendUserDto): string {
  return user.displayName ?? user.username;
}

async function createFriendRequestNotification(
  receiver: NotificationUserRecord,
  sender: NotificationUserRecord,
  requestId: string,
) {
  const locale = normalizeAppLocale(receiver.locale);
  const senderName = getDisplayName(sender);

  const notification = await prisma.notification.create({
    data: {
      userId: receiver.id,
      type: "FRIEND_REQUEST",
      title: translate(locale, "friends.notification.request.title"),
      body: translate(locale, "friends.notification.request.body", {
        name: senderName,
      }),
      actionUrl: "/channels/@me",
      metadata: {
        friendRequestId: requestId,
        senderId: sender.id,
      },
    },
  });

  const io = getSocketServer();
  if (io) {
    io.to(`user:${receiver.id}`).emit("notification:new", {
      id: notification.id,
      userId: receiver.id,
      type: "FRIEND_REQUEST",
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
      read: notification.read,
      readAt: notification.readAt?.toISOString() ?? null,
      actionUrl: notification.actionUrl,
      metadata: (notification.metadata as Record<string, unknown>) || null,
      createdAt: notification.createdAt.toISOString(),
    });
  }
}

function emitFriendsUpdated(userIds: Iterable<string>, reason: FriendsUpdatedReason) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  for (const userId of new Set(userIds)) {
    io.to(`user:${userId}`).emit("friends:updated", { reason });
  }
}

async function clearFriendRequestNotifications(
  requestId: string,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return;
  }

  await prisma.notification.deleteMany({
    where: {
      userId: { in: userIds },
      type: "FRIEND_REQUEST",
      metadata: {
        path: ["friendRequestId"],
        equals: requestId,
      },
    },
  });
}

async function createFriendAcceptedNotification(
  sender: NotificationUserRecord,
  receiver: NotificationUserRecord,
  requestId: string,
) {
  const locale = normalizeAppLocale(sender.locale);
  const receiverName = getDisplayName(receiver);

  const notification = await prisma.notification.create({
    data: {
      userId: sender.id,
      type: "FRIEND_ACCEPTED",
      title: translate(locale, "friends.notification.accepted.title"),
      body: translate(locale, "friends.notification.accepted.body", {
        name: receiverName,
      }),
      actionUrl: "/channels/@me",
      metadata: {
        friendRequestId: requestId,
        senderId: receiver.id,
        friendId: receiver.id,
      },
    },
  });

  const io = getSocketServer();
  if (io) {
    io.to(`user:${sender.id}`).emit("notification:new", {
      id: notification.id,
      userId: sender.id,
      type: "FRIEND_ACCEPTED",
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
      read: notification.read,
      readAt: notification.readAt?.toISOString() ?? null,
      actionUrl: notification.actionUrl,
      metadata: (notification.metadata as Record<string, unknown>) || null,
      createdAt: notification.createdAt.toISOString(),
    });
  }
}

function ensureDistinctUsers(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    throw new ApiError("Cannot target yourself", 400);
  }
}

function ensureNotBlocked(blockStatus: BlockStatus) {
  if (blockStatus.blocked) {
    throw new ApiError("Friend action is blocked", 400, "BLOCKED");
  }
}

export function mapStoredPresenceStatus(status: string | null | undefined): FriendPresenceStatus {
  if (status === "ONLINE" || status === "IDLE" || status === "DND") {
    return status;
  }

  return "OFFLINE";
}

export async function getUserPresenceBroadcast(
  userId: string,
): Promise<FriendPresenceUpdateDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      customStatus: true,
      status: true,
    },
  });

  return {
    userId,
    status: mapStoredPresenceStatus(user?.status),
    customStatus: user?.customStatus ?? null,
  };
}

export async function cacheUserPresence(
  userId: string,
  status: FriendPresenceStatus,
  customStatus?: string | null,
): Promise<FriendPresenceUpdateDto | null> {
  let nextCustomStatus = customStatus ?? null;

  if (customStatus === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { customStatus: true },
    });

    if (!user) {
      await getRedis().del(getPresenceRedisKey(userId));
      return null;
    }

    nextCustomStatus = user.customStatus ?? null;
  }

  await getRedis().hset(getPresenceRedisKey(userId), {
    customStatus: nextCustomStatus ?? "",
    status,
  });

  return {
    userId,
    status,
    customStatus: nextCustomStatus,
  };
}

export async function persistUserPresence(
  userId: string,
  status: FriendPresenceStatus,
  customStatus?: string | null,
): Promise<FriendPresenceUpdateDto | null> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { customStatus: true },
    });

    return cacheUserPresence(userId, status, customStatus ?? user.customStatus ?? null);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      await getRedis().del(getPresenceRedisKey(userId));
      return null;
    }

    throw error;
  }
}

export async function broadcastPresenceUpdateToFriends(
  update: FriendPresenceUpdateDto,
): Promise<void> {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const serverMemberships = await prisma.serverMember.findMany({
    where: { userId: update.userId },
    select: { serverId: true },
  });
  const serverIds = serverMemberships.map((membership) => membership.serverId);

  // Presence is rendered in friends, DMs, and shared server message history.
  // Emit to user rooms only; never broadcast presence globally.
  const [friendships, memberships] = await Promise.all([
    prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: update.userId }, { receiverId: update.userId }],
      },
      select: {
        receiverId: true,
        senderId: true,
      },
    }),
    prisma.serverMember.findMany({
      distinct: ["userId"],
      where: {
        serverId: { in: serverIds },
      },
      select: { userId: true },
    }),
  ]);

  const targetUserIds = new Set<string>([update.userId]);

  for (const friendship of friendships) {
    const friendId =
      friendship.senderId === update.userId ? friendship.receiverId : friendship.senderId;
    targetUserIds.add(friendId);
  }

  for (const membership of memberships) {
    targetUserIds.add(membership.userId);
  }

  for (const targetUserId of targetUserIds) {
    io.to(`user:${targetUserId}`).emit("presence:update", update);
  }
}

export async function listFriends(userId: string): Promise<FriendDto[]> {
  const friendships = await prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    include: {
      sender: { select: friendListUserSelect },
      receiver: { select: friendListUserSelect },
    },
    orderBy: { updatedAt: "desc" },
  });

  const redis = getRedis();

  return Promise.all(
    friendships.map(async (friendship) => {
      const friend: FriendListUserRecord =
        friendship.senderId === userId ? friendship.receiver : friendship.sender;
      const presence = await readPresence(redis, friend.id, {
        status: "OFFLINE",
        customStatus: friend.customStatus,
      });

      return {
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        status: presence.status,
        customStatus: presence.customStatus,
        presence,
      };
    }),
  );
}

export async function listPendingFriendRequests(userId: string): Promise<PendingFriendsResponse> {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { receiverId: userId, status: "PENDING" },
      include: friendRequestInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendRequest.findMany({
      where: { senderId: userId, status: "PENDING" },
      include: friendRequestInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    incoming: incoming.map(toFriendRequestDto),
    outgoing: outgoing.map(toFriendRequestDto),
  };
}

export async function sendFriendRequest(
  senderId: string,
  username: string,
): Promise<FriendRequestDto> {
  try {
    const isAllowed = await checkRateLimit(
      getRedis(),
      `rate:friend-request:${senderId}`,
      20,
      10 * 60,
    );

    if (!isAllowed) {
      throw new ApiError("Too many friend requests. Please try again later.", 429, "RATE_LIMITED");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logError("[friends] Rate limit unavailable", error);
    throw new ApiError(
      "Friend request checks are temporarily unavailable. Please try again shortly.",
      503,
      "RATE_LIMIT_UNAVAILABLE",
    );
  }

  const [sender, receiver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: senderId },
      select: notificationUserSelect,
    }),
    prisma.user.findUnique({
      where: { username },
      select: notificationUserSelect,
    }),
  ]);

  if (!sender) {
    throw new ApiError("Unauthorized", 401);
  }

  if (!receiver) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  ensureDistinctUsers(senderId, receiver.id);
  ensureNotBlocked(await getBlockStatus(senderId, receiver.id));

  const friendship = await getFriendship(senderId, receiver.id);
  if (friendship) {
    throw new ApiError("Already friends", 400, "ALREADY_FRIENDS");
  }

  const pendingRequest = await prisma.friendRequest.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { senderId, receiverId: receiver.id },
        { senderId: receiver.id, receiverId: senderId },
      ],
    },
    select: { id: true },
  });

  if (pendingRequest) {
    throw new ApiError("Friend request already pending", 400, "ALREADY_PENDING");
  }

  const request = await prisma.friendRequest.upsert({
    where: {
      senderId_receiverId: {
        senderId,
        receiverId: receiver.id,
      },
    },
    create: {
      senderId,
      receiverId: receiver.id,
      status: "PENDING",
    },
    update: {
      status: "PENDING",
    },
    include: friendRequestInclude,
  });

  await createFriendRequestNotification(receiver, sender, request.id);
  emitFriendsUpdated([senderId, receiver.id], "friend_request_received");

  return toFriendRequestDto(request);
}

export async function actOnFriendRequest(
  userId: string,
  requestId: string,
  action: "accept" | "decline",
): Promise<FriendRequestDto> {
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
    include: {
      sender: { select: notificationUserSelect },
      receiver: { select: notificationUserSelect },
    },
  });

  if (!request) {
    throw new ApiError("Friend request not found", 404, "NOT_FOUND");
  }

  if (request.receiverId !== userId) {
    throw new ApiError("Only the receiver can act on this request", 403);
  }

  if (request.status !== "PENDING") {
    throw new ApiError("Friend request is not pending", 400);
  }

  const updated = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
    include: friendRequestInclude,
  });

  await clearFriendRequestNotifications(request.id, [request.receiverId]);

  if (action === "accept") {
    await createFriendAcceptedNotification(request.sender, request.receiver, request.id);
  }

  emitFriendsUpdated(
    [request.senderId, request.receiverId],
    action === "accept" ? "friend_request_accepted" : "friend_request_rejected",
  );

  return toFriendRequestDto(updated);
}

export async function cancelFriendRequest(userId: string, requestId: string): Promise<void> {
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
    select: { receiverId: true, senderId: true, status: true },
  });

  if (!request) {
    throw new ApiError("Friend request not found", 404, "NOT_FOUND");
  }

  if (request.senderId !== userId) {
    throw new ApiError("Only the sender can cancel this request", 403);
  }

  if (request.status !== "PENDING") {
    throw new ApiError("Friend request is not pending", 400);
  }

  await prisma.friendRequest.delete({
    where: { id: requestId },
  });

  await clearFriendRequestNotifications(requestId, [request.receiverId]);

  emitFriendsUpdated([request.senderId, request.receiverId], "friend_request_canceled");
}

export async function removeFriend(userId: string, friendUserId: string): Promise<void> {
  ensureDistinctUsers(userId, friendUserId);

  const friendship = await getFriendship(userId, friendUserId);
  if (!friendship) {
    throw new ApiError("Friendship not found", 404, "NOT_FOUND");
  }

  await prisma.friendRequest.delete({
    where: { id: friendship.id },
  });

  emitFriendsUpdated([userId, friendUserId], "friend_removed");
}

export async function blockUser(userId: string, blockedUserId: string): Promise<FriendUserDto> {
  ensureDistinctUsers(userId, blockedUserId);

  const blockedUser = await prisma.user.findUnique({
    where: { id: blockedUserId },
    select: friendUserSelect,
  });

  if (!blockedUser) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  const incomingRequests = await prisma.friendRequest.findMany({
    where: {
      senderId: blockedUserId,
      receiverId: userId,
      status: { not: "BLOCKED" },
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.friendRequest.deleteMany({
      where: {
        senderId: blockedUserId,
        receiverId: userId,
        status: { not: "BLOCKED" },
      },
    });

    await tx.friendRequest.upsert({
      where: {
        senderId_receiverId: {
          senderId: userId,
          receiverId: blockedUserId,
        },
      },
      create: {
        senderId: userId,
        receiverId: blockedUserId,
        status: "BLOCKED",
      },
      update: {
        status: "BLOCKED",
      },
    });
  });

  if (incomingRequests.length > 0) {
    await Promise.all(
      incomingRequests.map((request) =>
        clearFriendRequestNotifications(request.id, [userId]),
      ),
    );
  }

  emitFriendsUpdated([userId, blockedUserId], "blocked");

  return toFriendUserDto(blockedUser);
}

export async function unblockUser(userId: string, blockedUserId: string): Promise<void> {
  ensureDistinctUsers(userId, blockedUserId);

  const result = await prisma.friendRequest.deleteMany({
    where: {
      senderId: userId,
      receiverId: blockedUserId,
      status: "BLOCKED",
    },
  });

  if (result.count === 0) {
    throw new ApiError("Block not found", 404, "NOT_FOUND");
  }

  emitFriendsUpdated([userId, blockedUserId], "unblocked");
}

export async function listBlockedUsers(userId: string): Promise<FriendUserDto[]> {
  const blockedRows = await prisma.friendRequest.findMany({
    where: {
      senderId: userId,
      status: "BLOCKED",
    },
    include: {
      receiver: { select: friendUserSelect },
    },
    orderBy: { updatedAt: "desc" },
  });

  return blockedRows.map((row) => toFriendUserDto(row.receiver));
}
