import { prisma } from "@wizards/db";
import type { FriendRequest } from "@wizards/db";
import type { BlockStatus } from "@/lib/friends/types";

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

export async function haveMutualFriends(userA: string, userB: string): Promise<boolean> {
  const userAFriendships = await prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ senderId: userA }, { receiverId: userA }],
    },
    select: {
      receiverId: true,
      senderId: true,
    },
  });
  const userAFriendIds = userAFriendships.map((friendship) =>
    friendship.senderId === userA ? friendship.receiverId : friendship.senderId,
  );

  if (userAFriendIds.length === 0) {
    return false;
  }

  const mutualFriendship = await prisma.friendRequest.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        {
          receiverId: userB,
          senderId: { in: userAFriendIds },
        },
        {
          receiverId: { in: userAFriendIds },
          senderId: userB,
        },
      ],
    },
    select: { id: true },
  });

  return mutualFriendship !== null;
}
