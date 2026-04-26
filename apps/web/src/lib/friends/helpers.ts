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
