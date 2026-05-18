import { prisma } from "@wizards/db";
import type { FriendRequest, Prisma } from "@wizards/db";
import type { BlockStatus } from "@/lib/friends/types";

export async function getBlockedUserIdsForUser(
  userId: string,
  candidateUserIds: readonly string[],
): Promise<Set<string>> {
  const uniqueCandidateUserIds = Array.from(
    new Set(candidateUserIds.filter((candidateUserId) => candidateUserId !== userId)),
  );

  if (uniqueCandidateUserIds.length === 0) {
    return new Set();
  }

  const blockedRows = await prisma.friendRequest.findMany({
    where: {
      status: "BLOCKED",
      OR: [
        { senderId: userId, receiverId: { in: uniqueCandidateUserIds } },
        { senderId: { in: uniqueCandidateUserIds }, receiverId: userId },
      ],
    },
    select: {
      senderId: true,
      receiverId: true,
    },
  });

  return new Set(
    blockedRows.map((row) => (row.senderId === userId ? row.receiverId : row.senderId)),
  );
}

export async function getBlockStatus(userA: string, userB: string): Promise<BlockStatus> {
  const blockedRows = await prisma.friendRequest.findMany({
    where: {
      status: "BLOCKED",
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
    select: {
      senderId: true,
      receiverId: true,
    },
  });

  const blockedByUserA = blockedRows.some(
    (row) => row.senderId === userA && row.receiverId === userB,
  );
  const blockedByUserB = blockedRows.some(
    (row) => row.senderId === userB && row.receiverId === userA,
  );

  return {
    blocked: blockedByUserA || blockedByUserB,
    blockedByUserA,
    blockedByUserB,
  };
}

export async function getFriendship(userA: string, userB: string): Promise<FriendRequest | null> {
  return prisma.friendRequest.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
  });
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const friendship = await prisma.friendRequest.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
    select: { id: true },
  });

  return friendship !== null;
}

export async function haveMutualServers(userA: string, userB: string): Promise<boolean> {
  const sharedMembership = await prisma.serverMember.findFirst({
    where: {
      userId: userA,
      server: {
        members: {
          some: {
            userId: userB,
          },
        },
      },
    },
    select: { id: true },
  });

  return sharedMembership !== null;
}

function userHasAcceptedFriendshipWith(userId: string): Prisma.UserWhereInput {
  return {
    OR: [
      {
        friendRequestsSent: {
          some: {
            receiverId: userId,
            status: "ACCEPTED",
          },
        },
      },
      {
        friendRequestsReceived: {
          some: {
            senderId: userId,
            status: "ACCEPTED",
          },
        },
      },
    ],
  };
}

export function buildMutualFriendsWhere(
  userA: string,
  userB: string,
): Prisma.FriendRequestWhereInput {
  return {
    status: "ACCEPTED",
    OR: [
      {
        senderId: userA,
        receiver: userHasAcceptedFriendshipWith(userB),
      },
      {
        receiverId: userA,
        sender: userHasAcceptedFriendshipWith(userB),
      },
    ],
  };
}

export async function haveMutualFriends(userA: string, userB: string): Promise<boolean> {
  const mutualFriendship = await prisma.friendRequest.findFirst({
    where: buildMutualFriendsWhere(userA, userB),
    select: { id: true },
  });

  return mutualFriendship !== null;
}
