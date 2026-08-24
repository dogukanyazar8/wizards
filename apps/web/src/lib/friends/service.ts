import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getRedis, getRedisRate } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import {
  getBlockStatus,
  getFriendship,
  haveMutualFriends,
  haveMutualServers,
} from "@/lib/friends/helpers";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSocketServer } from "@/lib/socket/runtime";
import { applyServerOnlinePresenceForSocket } from "@/lib/socket/server-online-presence";
import { logError } from "@/lib/logger";
import { readPresenceState } from "@/lib/presence";
import { canSendFriendRequest } from "@/lib/privacy-policy";
import {
  buildPresenceBroadcastAudience,
  profileVisibilityWhereForViewer,
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { isLiveInvite } from "@/lib/workspace/invite-selection";
import type {
  BlockStatus,
  FriendDto,
  FriendPresenceStatus,
  FriendPresenceUpdateDto,
  FriendRelationship,
  FriendRequestDto,
  FriendSearchResultDto,
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
  // 2b §7. The picker greys out a friend who takes no group invites, so the
  // list that feeds it carries the switch rather than asking per row.
  settings: { select: { allowGroupInvites: true } },
} as const;

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

type FriendsUpdatedReason =
  | "blocked"
  | "friend_request_accepted"
  | "friend_request_canceled"
  | "friend_request_received"
  | "friend_request_rejected"
  | "friend_removed"
  | "unblocked";

export const PRESENCE_CACHE_TTL_SECONDS = 180;
const PRESENCE_FRIEND_IDS_FIELD = "fanoutFriendIds";
const PRESENCE_SERVER_IDS_FIELD = "fanoutServerIds";

function getPresenceRedisKey(userId: string) {
  return `presence:${userId}`;
}

type PresenceAudienceRedis = {
  expire(key: string, seconds: number): Promise<unknown>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<unknown>;
};

type PresenceAudienceDependencies = {
  findFriendships(userId: string): Promise<Array<{ receiverId: string; senderId: string }>>;
  findServerMemberships(userId: string): Promise<Array<{ serverId: string }>>;
  redis: PresenceAudienceRedis;
};

function createDefaultPresenceAudienceDependencies(): PresenceAudienceDependencies {
  return {
    findFriendships: (userId) =>
      prisma.friendRequest.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { receiverId: true, senderId: true },
      }),
    findServerMemberships: (userId) =>
      prisma.serverMember.findMany({
        where: { userId },
        select: { serverId: true },
      }),
    redis: getRedis(),
  };
}

function parseCachedIds(value: string | null) {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? Array.from(new Set(parsed))
      : null;
  } catch {
    return null;
  }
}

async function readCachedPresenceAudienceIds(
  userId: string,
  field: string,
  dependencies: PresenceAudienceDependencies,
) {
  try {
    return parseCachedIds(await dependencies.redis.hget(getPresenceRedisKey(userId), field));
  } catch {
    return null;
  }
}

async function cachePresenceAudienceIds(
  userId: string,
  field: string,
  ids: string[],
  dependencies: PresenceAudienceDependencies,
) {
  try {
    const key = getPresenceRedisKey(userId);
    await dependencies.redis.hset(key, field, JSON.stringify(ids));
    await dependencies.redis.expire(key, PRESENCE_CACHE_TTL_SECONDS);
  } catch {
    // Fan-out still has the freshly queried ids. Cache loss must not suppress
    // a presence update or fail the friend mutation that invalidates it.
  }
}

export async function getPresenceFriendUserIds(
  userId: string,
  dependencies: PresenceAudienceDependencies = createDefaultPresenceAudienceDependencies(),
) {
  const cached = await readCachedPresenceAudienceIds(
    userId,
    PRESENCE_FRIEND_IDS_FIELD,
    dependencies,
  );
  if (cached) {
    return cached;
  }

  const friendships = await dependencies.findFriendships(userId);
  const friendUserIds = Array.from(
    new Set(
      friendships.map((friendship) =>
        friendship.senderId === userId ? friendship.receiverId : friendship.senderId,
      ),
    ),
  );
  await cachePresenceAudienceIds(userId, PRESENCE_FRIEND_IDS_FIELD, friendUserIds, dependencies);
  return friendUserIds;
}

export async function getPresenceServerIds(
  userId: string,
  dependencies: PresenceAudienceDependencies = createDefaultPresenceAudienceDependencies(),
) {
  const cached = await readCachedPresenceAudienceIds(
    userId,
    PRESENCE_SERVER_IDS_FIELD,
    dependencies,
  );
  if (cached) {
    return cached;
  }

  const serverIds = Array.from(
    new Set((await dependencies.findServerMemberships(userId)).map(({ serverId }) => serverId)),
  );
  await cachePresenceAudienceIds(userId, PRESENCE_SERVER_IDS_FIELD, serverIds, dependencies);
  return serverIds;
}

export async function invalidatePresenceAudienceCache(
  userIds: Iterable<string>,
  redis: PresenceAudienceRedis = getRedis(),
) {
  await Promise.all(
    Array.from(new Set(userIds)).map((userId) =>
      redis.hdel(getPresenceRedisKey(userId), PRESENCE_FRIEND_IDS_FIELD, PRESENCE_SERVER_IDS_FIELD),
    ),
  );
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
      actionUrl: "/messages",
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

  void sendMobilePushForNotifications([
    {
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    },
  ]).catch(() => undefined);
}

async function emitFriendsUpdated(userIds: Iterable<string>, reason: FriendsUpdatedReason) {
  const uniqueUserIds = Array.from(new Set(userIds));
  try {
    await invalidatePresenceAudienceCache(uniqueUserIds);
  } catch (error) {
    logError("[friends] Presence audience cache invalidation failed", error);
  }

  const io = getSocketServer();
  if (!io) {
    return;
  }

  for (const userId of uniqueUserIds) {
    io.to(`user:${userId}`).emit("friends:updated", { reason });
  }
}

async function clearFriendRequestNotifications(requestId: string, userIds: string[]) {
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
      actionUrl: "/messages",
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

  void sendMobilePushForNotifications([
    {
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    },
  ]).catch(() => undefined);
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

export async function getUserPresenceBroadcast(userId: string): Promise<FriendPresenceUpdateDto> {
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

  const redis = getRedis();
  const key = getPresenceRedisKey(userId);
  await redis
    .pipeline()
    .hset(key, {
      customStatus: nextCustomStatus ?? "",
      status,
    })
    .expire(key, PRESENCE_CACHE_TTL_SECONDS)
    .exec();

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

  const [user, blockRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: update.userId },
      select: { settings: { select: { presenceVisibility: true } } },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ senderId: update.userId }, { receiverId: update.userId }],
      },
      select: { receiverId: true, senderId: true },
    }),
  ]);
  if (!user) return;

  const presenceVisibility = user.settings?.presenceVisibility ?? "EVERYONE";
  const [friendUserIds, serverIds] = await Promise.all([
    presenceVisibility === "NOBODY" ? Promise.resolve([]) : getPresenceFriendUserIds(update.userId),
    presenceVisibility === "EVERYONE" ? getPresenceServerIds(update.userId) : Promise.resolve([]),
  ]);
  const audience = buildPresenceBroadcastAudience({
    blockedUserIds: blockRows.map((row) =>
      row.senderId === update.userId ? row.receiverId : row.senderId,
    ),
    friendUserIds,
    presenceVisibility,
    serverIds,
    userId: update.userId,
  });

  io.to(`user:${update.userId}`).emit("presence:update", update);
  const publicRooms = [
    ...audience.directUserIds
      .filter((userId) => userId !== update.userId)
      .map((userId) => `user:${userId}`),
    ...audience.serverIds.map((serverId) => `server:${serverId}`),
  ];
  if (publicRooms.length === 0) return;

  io.to(publicRooms)
    .except([`user:${update.userId}`, ...audience.blockedUserIds.map((userId) => `user:${userId}`)])
    .emit("presence:update", {
      ...update,
      customStatus: update.status === "OFFLINE" ? null : update.customStatus,
    });
}

/**
 * Clear every relationship-scoped cache before publishing the newly narrowed
 * audience. This prevents a viewer that was allowed by the previous setting
 * from retaining a stale online/custom-status or voice-room value.
 */
export async function broadcastPresenceVisibilityChanged(userId: string): Promise<void> {
  const io = getSocketServer();
  if (!io) return;

  const [user, friendUserIds, serverIds, blockRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { settings: { select: { presenceVisibility: true } } },
    }),
    getPresenceFriendUserIds(userId),
    getPresenceServerIds(userId),
    prisma.friendRequest.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { receiverId: true, senderId: true },
    }),
  ]);
  if (!user) return;
  const presenceVisibility = user.settings?.presenceVisibility ?? "EVERYONE";
  const audience = buildPresenceBroadcastAudience({
    blockedUserIds: blockRows.map((row) =>
      row.senderId === userId ? row.receiverId : row.senderId,
    ),
    friendUserIds,
    presenceVisibility: "EVERYONE",
    serverIds,
    userId,
  });
  const excludedRooms = [
    `user:${userId}`,
    ...audience.blockedUserIds.map((blockedUserId) => `user:${blockedUserId}`),
  ];
  const staleRooms = [
    ...audience.directUserIds
      .filter((targetUserId) => targetUserId !== userId)
      .map((targetUserId) => `user:${targetUserId}`),
    ...audience.serverIds.map((serverId) => `server:${serverId}`),
  ];

  if (staleRooms.length > 0) {
    io.to(staleRooms).except(excludedRooms).emit("presence:update", {
      customStatus: null,
      status: "OFFLINE",
      userId,
    });
  }
  for (const friendUserId of audience.directUserIds) {
    if (friendUserId !== userId) {
      io.to(`user:${friendUserId}`).emit("friends:voice:update", {
        userId,
        voiceRoom: null,
      });
    }
  }

  try {
    const userSockets = await io.in(`user:${userId}`).fetchSockets();
    await Promise.all(
      userSockets.map(async (socket) => {
        socket.data.presenceVisibility = presenceVisibility;
        await applyServerOnlinePresenceForSocket(getRedis(), socket, userId);
      }),
    );
  } catch (error) {
    logError("[presence visibility] Socket online-set convergence failed", error);
  }

  await broadcastPresenceUpdateToFriends(await getUserPresenceBroadcast(userId));
}

/**
 * Messaging redesign §2 "1a".5: a friend joining or leaving a voice room, pushed
 * to every friend's personal room.
 *
 * `voice:state:update` only reaches sockets watching that voice channel, so the
 * conversations strip — which is nowhere near the server it happened in — would
 * otherwise keep drawing the presence dot until the friends query refetched.
 */
export async function broadcastVoiceRoomUpdateToFriends(args: {
  action: "join" | "leave";
  channelId: string;
  serverId: string;
  userId: string;
}): Promise<void> {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const [user, blockRows, friendUserIds, channel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.userId },
      select: { settings: { select: { presenceVisibility: true } } },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ senderId: args.userId }, { receiverId: args.userId }],
      },
      select: { receiverId: true, senderId: true },
    }),
    getPresenceFriendUserIds(args.userId),
    args.action === "join"
      ? prisma.channel.findUnique({
          where: { id: args.channelId },
          select: { name: true, server: { select: { id: true, name: true } } },
        })
      : Promise.resolve(null),
  ]);

  // A join whose channel or server cannot be named has nothing to render, so it
  // is dropped rather than sent as a half-filled tile.
  if (args.action === "join" && !channel?.server) {
    return;
  }

  const voiceRoom =
    args.action === "join" && channel?.server
      ? {
          channelId: args.channelId,
          channelName: channel.name,
          serverId: channel.server.id,
          serverName: channel.server.name,
        }
      : null;

  const audience = buildPresenceBroadcastAudience({
    blockedUserIds: blockRows.map((row) =>
      row.senderId === args.userId ? row.receiverId : row.senderId,
    ),
    friendUserIds,
    presenceVisibility: user?.settings?.presenceVisibility ?? "EVERYONE",
    serverIds: [],
    userId: args.userId,
  });

  for (const targetUserId of audience.directUserIds) {
    io.to(`user:${targetUserId}`).emit("friends:voice:update", {
      userId: args.userId,
      voiceRoom,
    });
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

  const friends = friendships.map((friendship) =>
    friendship.senderId === userId ? friendship.receiver : friendship.sender,
  );
  const friendUserIds = friends.map((friend) => friend.id);
  const [presenceState, rawLastSeenByUserId, visibilityDecisions] = await Promise.all([
    readPresenceState(
      getRedis(),
      friends.map((friend) => ({
        customStatus: friend.customStatus,
        status: "OFFLINE",
        userId: friend.id,
      })),
    ),
    resolveLastSeenAtByUserId(friendUserIds),
    resolveVisibilityDecisions(userId, friendUserIds),
  ]);
  const { hiddenUserIds, lastSeenByUserId, presenceByUserId } = redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: rawLastSeenByUserId,
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds: friendUserIds,
  });

  return friends.map((friend) => {
    const presence = presenceByUserId.get(friend.id) ?? {
      status: "OFFLINE" as const,
      customStatus: friend.customStatus,
    };

    return {
      // A friend whose settings row does not exist yet is open, the same answer
      // the column's own default gives.
      allowsGroupInvites: friend.settings?.allowGroupInvites ?? true,
      id: friend.id,
      username: friend.username,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      status: presence.status,
      customStatus: presence.customStatus,
      // Invisible friends keep heartbeating behind an offline dot; publishing
      // their last-seen would undo the mode they chose.
      lastSeenAt: hiddenUserIds.has(friend.id) ? null : (lastSeenByUserId.get(friend.id) ?? null),
      presence,
      // The invite sheet this list feeds shows no voice room, so it does not pay
      // for the read. `queries.ts` is the copy the Ana Sayfa strip calls.
      voiceRoom: null,
    };
  });
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

/** Highest-precedence relationship wins when a pair carries several request rows. */
const FRIEND_RELATIONSHIP_PRECEDENCE: Record<FriendRelationship, number> = {
  none: 0,
  outgoing: 1,
  incoming: 2,
  friend: 3,
  blocked: 4,
};

export const USER_SEARCH_RESULT_LIMIT = 20;
export const USER_SEARCH_MIN_TERM_LENGTH = 2;

/** Mobile clients send the typed value verbatim, so a leading "@" is tolerated here. */
export function normalizeUserSearchTerm(query: string): string {
  return query.trim().replace(/^@+/, "").trim();
}

function toFriendRelationship(
  userId: string,
  row: { receiverId: string; senderId: string; status: string },
): FriendRelationship {
  if (row.status === "BLOCKED") {
    return "blocked";
  }

  if (row.status === "ACCEPTED") {
    return "friend";
  }

  if (row.status === "PENDING") {
    return row.senderId === userId ? "outgoing" : "incoming";
  }

  return "none";
}

/** Neutral server context, used by every global (server-less) search result. */
const EMPTY_SERVER_CONTEXT = {
  isMember: false,
  mutualServerCount: 0,
  pendingInviteId: null,
} as const;

type UserSearchServerContext = {
  isMember: boolean;
  mutualServerCount: number;
  pendingInviteId: string | null;
};

/**
 * Invite-sheet 2b needs three server-relative facts per row that the global
 * search has no notion of: whether the user is already in the server, how many
 * servers they share with the viewer, and whether a targeted invite is already
 * waiting. Only reached when the caller names a server.
 */
async function loadUserSearchServerContext(
  viewerUserId: string,
  serverId: string,
  candidateUserIds: readonly string[],
): Promise<Map<string, UserSearchServerContext>> {
  const userIds = [...candidateUserIds];
  const [memberships, viewerServerIds, pendingInvites] = await Promise.all([
    prisma.serverMember.findMany({
      where: { serverId, userId: { in: userIds } },
      select: { userId: true },
    }),
    prisma.serverMember.findMany({
      where: { userId: viewerUserId },
      select: { serverId: true },
    }),
    prisma.serverInvite.findMany({
      where: { serverId, targetUserId: { in: userIds } },
      select: { expiresAt: true, id: true, maxUses: true, targetUserId: true, uses: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const viewerServerIdList = viewerServerIds.map((row) => row.serverId);
  const mutualRows =
    viewerServerIdList.length === 0
      ? []
      : await prisma.serverMember.findMany({
          where: { serverId: { in: viewerServerIdList }, userId: { in: userIds } },
          select: { userId: true },
        });

  const memberUserIds = new Set(memberships.map((row) => row.userId));
  const mutualCountByUserId = new Map<string, number>();
  for (const row of mutualRows) {
    mutualCountByUserId.set(row.userId, (mutualCountByUserId.get(row.userId) ?? 0) + 1);
  }

  const now = Date.now();
  const pendingInviteIdByUserId = new Map<string, string>();
  for (const invite of pendingInvites) {
    if (!invite.targetUserId || pendingInviteIdByUserId.has(invite.targetUserId)) {
      continue;
    }
    if (!isLiveInvite(invite, now)) {
      continue;
    }
    pendingInviteIdByUserId.set(invite.targetUserId, invite.id);
  }

  return new Map(
    userIds.map((id) => [
      id,
      {
        isMember: memberUserIds.has(id),
        mutualServerCount: mutualCountByUserId.get(id) ?? 0,
        pendingInviteId: pendingInviteIdByUserId.get(id) ?? null,
      },
    ]),
  );
}

export async function searchUsers(
  userId: string,
  query: string,
  limit = USER_SEARCH_RESULT_LIMIT,
  serverId?: string,
): Promise<FriendSearchResultDto[]> {
  const term = normalizeUserSearchTerm(query);
  if (term.length < USER_SEARCH_MIN_TERM_LENGTH) {
    return [];
  }

  const take = Math.min(Math.max(1, Math.trunc(limit)), USER_SEARCH_RESULT_LIMIT);
  const users = await prisma.user.findMany({
    where: {
      AND: [
        profileVisibilityWhereForViewer(userId),
        {
          deletedAt: null,
          id: { not: userId },
          OR: [
            { username: { contains: term, mode: "insensitive" as const } },
            { displayName: { contains: term, mode: "insensitive" as const } },
          ],
        },
      ],
    },
    select: friendUserSelect,
    orderBy: [{ username: "asc" }],
    take,
  });

  if (users.length === 0) {
    return [];
  }

  const relationRows = await prisma.friendRequest.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: { in: users.map((user) => user.id) } },
        { senderId: { in: users.map((user) => user.id) }, receiverId: userId },
      ],
    },
    select: { id: true, receiverId: true, senderId: true, status: true },
  });

  const relationByUserId = new Map<
    string,
    { relationship: FriendRelationship; requestId: string | null }
  >();

  for (const row of relationRows) {
    const relationship = toFriendRelationship(userId, row);
    if (relationship === "none") {
      continue;
    }

    const otherUserId = row.senderId === userId ? row.receiverId : row.senderId;
    const current = relationByUserId.get(otherUserId);
    if (
      current &&
      FRIEND_RELATIONSHIP_PRECEDENCE[current.relationship] >=
        FRIEND_RELATIONSHIP_PRECEDENCE[relationship]
    ) {
      continue;
    }

    relationByUserId.set(otherUserId, {
      relationship,
      requestId: relationship === "incoming" || relationship === "outgoing" ? row.id : null,
    });
  }

  const serverContextByUserId = serverId
    ? await loadUserSearchServerContext(
        userId,
        serverId,
        users.map((user) => user.id),
      )
    : null;

  return users
    .map((user) => {
      const relation = relationByUserId.get(user.id);
      return {
        ...toFriendUserDto(user),
        ...(serverContextByUserId?.get(user.id) ?? EMPTY_SERVER_CONTEXT),
        relationship: relation?.relationship ?? ("none" as const),
        requestId: relation?.requestId ?? null,
      };
    })
    .filter((result) => result.relationship !== "blocked");
}

export async function sendFriendRequest(
  senderId: string,
  username: string,
): Promise<FriendRequestDto> {
  try {
    const isAllowed = await checkRateLimit(
      getRedisRate(),
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

  const receiverSettings = await prisma.userSettings.findUnique({
    where: { userId: receiver.id },
    select: { friendRequestPolicy: true },
  });
  const friendRequestPolicy = receiverSettings?.friendRequestPolicy ?? "EVERYONE";
  const [sharesMutualServers, sharesMutualFriends] = await Promise.all([
    haveMutualServers(senderId, receiver.id),
    haveMutualFriends(senderId, receiver.id),
  ]);

  if (
    !canSendFriendRequest(friendRequestPolicy, {
      haveMutualFriends: sharesMutualFriends,
      haveMutualServers: sharesMutualServers,
    })
  ) {
    throw new ApiError("This user is not accepting friend requests", 403, "FRIEND_REQUEST_POLICY");
  }

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
  await emitFriendsUpdated([senderId, receiver.id], "friend_request_received");

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

  await emitFriendsUpdated(
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

  await emitFriendsUpdated([request.senderId, request.receiverId], "friend_request_canceled");
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

  await emitFriendsUpdated([userId, friendUserId], "friend_removed");
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
      incomingRequests.map((request) => clearFriendRequestNotifications(request.id, [userId])),
    );
  }

  await emitFriendsUpdated([userId, blockedUserId], "blocked");

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

  await emitFriendsUpdated([userId, blockedUserId], "unblocked");
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
