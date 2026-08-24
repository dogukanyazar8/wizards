import { ChannelType, prisma } from "@wizards/db";
import { getRedis } from "@/lib/redis";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { readPresenceState } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import type {
  FriendDto,
  FriendRequestDto,
  FriendStatusDto,
  FriendUserDto,
  FriendVoiceRoomDto,
  PendingFriendsResponse,
} from "@/lib/friends/types";
import { getStaleVoiceHeartbeatCutoff } from "@/lib/voice/types";
import { listChannelIdsByServerForUserWithPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

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

const friendListUserSelect = {
  ...friendUserSelect,
  customStatus: true,
  // 2b §7. The picker greys out a friend who takes no group invites, so the
  // list that feeds it carries the switch rather than asking per row.
  settings: { select: { allowGroupInvites: true } },
} as const;

export type FriendPageOptions = { cursor?: string; limit?: number };

/** Exactly what the voice room needs; the row is never spread into the DTO. */
const friendVoiceStateSelect = {
  channel: { select: { name: true, server: { select: { id: true, name: true } } } },
  channelId: true,
  serverId: true,
  userId: true,
} as const;

type FriendVoiceStateRow = {
  channel: { name: string; server: { id: string; name: string } | null } | null;
  channelId: string;
  serverId: string;
  userId: string;
};

/**
 * Ana Sayfa 1a §4.6 — live voice states keyed by the friend in them.
 *
 * `hiddenUserIds` is the same set that already redacts presence and last-seen:
 * a friend the viewer may not see (invisible, or presence closed to them) leaks
 * no room either. A channel without VIEW_CHANNEL is equally opaque. A state
 * whose channel or server cannot be named is dropped
 * rather than half-rendered, the same rule `broadcastVoiceRoomUpdateToFriends`
 * applies to the socket event.
 */
export function toFriendVoiceRoomMap(
  rows: readonly FriendVoiceStateRow[],
  hiddenUserIds: ReadonlySet<string>,
  visibleChannelIds: ReadonlySet<string>,
): Map<string, FriendVoiceRoomDto> {
  const rooms = new Map<string, FriendVoiceRoomDto>();

  for (const row of rows) {
    if (
      hiddenUserIds.has(row.userId) ||
      !visibleChannelIds.has(row.channelId) ||
      !row.channel?.server
    ) {
      continue;
    }

    rooms.set(row.userId, {
      channelId: row.channelId,
      channelName: row.channel.name,
      serverId: row.channel.server.id,
      serverName: row.channel.server.name,
    });
  }

  return rooms;
}

export function friendPageQuery(options: FriendPageOptions) {
  const requestedLimit = Math.trunc(options.limit ?? 100);
  const take = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
  return {
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take,
  };
}

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

export async function listFriends(
  userId: string,
  options: FriendPageOptions = {},
): Promise<FriendDto[]> {
  const friendships = await prisma.friendRequest.findMany({
    ...friendPageQuery(options),
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
  const [presenceState, rawLastSeenByUserId, visibilityDecisions, voiceStates] = await Promise.all([
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
    // A state whose heartbeat went stale is not a live room; the cutoff is the
    // cleanup's own (`00-ortak-baglam` §6.6), never a second constant.
    friendUserIds.length > 0
      ? prisma.voiceState.findMany({
          select: friendVoiceStateSelect,
          where: {
            lastHeartbeat: { gte: getStaleVoiceHeartbeatCutoff(new Date()) },
            userId: { in: friendUserIds },
          },
        })
      : Promise.resolve([]),
  ]);
  const { hiddenUserIds, lastSeenByUserId, presenceByUserId } = redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: rawLastSeenByUserId,
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds: friendUserIds,
  });
  const voiceServerIds = [...new Set(voiceStates.map((state) => state.serverId))];
  const visibleVoiceChannelIdsByServer = await listChannelIdsByServerForUserWithPermission(
    userId,
    voiceServerIds,
    PermissionBits.VIEW_CHANNEL,
    ChannelType.VOICE,
  );
  const visibleVoiceChannelIds = new Set([...visibleVoiceChannelIdsByServer.values()].flat());
  const voiceRoomByUserId = toFriendVoiceRoomMap(
    voiceStates,
    hiddenUserIds,
    visibleVoiceChannelIds,
  );

  return friends.map((friend) => {
    const presence = presenceByUserId.get(friend.id) ?? {
      status: "OFFLINE" as const,
      customStatus: friend.customStatus,
    };

    return {
      // A friend whose settings row does not exist yet is open, the same answer
      // the column's own default gives.
      allowsGroupInvites: friend.settings?.allowGroupInvites ?? true,
      // Invisible friends keep heartbeating behind an offline dot; publishing
      // their last-seen would undo the mode they chose.
      lastSeenAt: hiddenUserIds.has(friend.id) ? null : (lastSeenByUserId.get(friend.id) ?? null),
      id: friend.id,
      username: friend.username,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      status: presence.status,
      customStatus: presence.customStatus,
      presence,
      voiceRoom: voiceRoomByUserId.get(friend.id) ?? null,
    };
  });
}

export async function listPendingFriendRequests(
  userId: string,
  options: FriendPageOptions = {},
): Promise<PendingFriendsResponse> {
  const page = friendPageQuery(options);
  const [incoming, outgoing] = await Promise.all([
    prisma.friendRequest.findMany({
      ...page,
      where: { receiverId: userId, status: "PENDING" },
      include: friendRequestInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendRequest.findMany({
      ...page,
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

export async function listBlockedUsers(
  userId: string,
  options: FriendPageOptions = {},
): Promise<FriendUserDto[]> {
  const blockedRows = await prisma.friendRequest.findMany({
    ...friendPageQuery(options),
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
