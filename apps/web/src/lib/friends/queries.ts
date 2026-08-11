import { prisma } from "@wizards/db";
import { getRedis } from "@/lib/redis";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { readPresenceState } from "@/lib/presence";
import type {
  FriendDto,
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
  const [{ hiddenUserIds, presenceByUserId }, lastSeenByUserId] = await Promise.all([
    readPresenceState(
      getRedis(),
      friends.map((friend) => ({
        customStatus: friend.customStatus,
        status: "OFFLINE",
        userId: friend.id,
      })),
    ),
    resolveLastSeenAtByUserId(friends.map((friend) => friend.id)),
  ]);

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
