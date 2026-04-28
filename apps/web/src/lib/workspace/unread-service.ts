import { Prisma, prisma } from "@wizards/db";
import { getSocketServer } from "@/lib/socket/runtime";

type ServerUnreadCountRow = {
  serverId: string;
  unreadCount: bigint | number;
};

function toUnreadCount(value: bigint | number) {
  return typeof value === "bigint" ? Number(value) : value;
}

export async function getServerUnreadCounts(userId: string, serverIds: string[]) {
  if (serverIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await prisma.$queryRaw<ServerUnreadCountRow[]>(Prisma.sql`
    SELECT
      sm."serverId" AS "serverId",
      COUNT(m."id")::bigint AS "unreadCount"
    FROM "ServerMember" sm
    LEFT JOIN "Channel" c
      ON c."serverId" = sm."serverId"
      AND c."parentId" IS NULL
      AND c."type" = 'TEXT'
    LEFT JOIN "ChannelReadState" crs
      ON crs."channelId" = c."id"
      AND crs."userId" = sm."userId"
    LEFT JOIN "Message" m
      ON m."channelId" = c."id"
      AND m."threadId" IS NULL
      AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
    WHERE sm."userId" = ${userId}
      AND sm."serverId" IN (${Prisma.join(serverIds)})
    GROUP BY sm."serverId"
  `);

  const unreadCounts = new Map<string, number>();
  for (const serverId of serverIds) {
    unreadCounts.set(serverId, 0);
  }

  for (const row of rows) {
    unreadCounts.set(row.serverId, toUnreadCount(row.unreadCount));
  }

  return unreadCounts;
}

export async function getServerUnreadCount(userId: string, serverId: string) {
  const unreadCounts = await getServerUnreadCounts(userId, [serverId]);
  return unreadCounts.get(serverId) ?? 0;
}

export async function getServerUnreadCountsBatch(userIds: string[], serverId: string) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const unreadCounts = new Map<string, number>();

  for (const userId of uniqueUserIds) {
    unreadCounts.set(userId, 0);
  }

  if (uniqueUserIds.length === 0) {
    return unreadCounts;
  }

  const rows = await prisma.$queryRaw<Array<{ userId: string; unreadCount: bigint | number }>>(Prisma.sql`
    SELECT
      sm."userId" AS "userId",
      COUNT(m."id")::bigint AS "unreadCount"
    FROM "ServerMember" sm
    LEFT JOIN "Channel" c
      ON c."serverId" = sm."serverId"
      AND c."parentId" IS NULL
      AND c."type" = 'TEXT'
    LEFT JOIN "ChannelReadState" crs
      ON crs."channelId" = c."id"
      AND crs."userId" = sm."userId"
    LEFT JOIN "Message" m
      ON m."channelId" = c."id"
      AND m."threadId" IS NULL
      AND m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")
    WHERE sm."serverId" = ${serverId}
      AND sm."userId" IN (${Prisma.join(uniqueUserIds)})
    GROUP BY sm."userId"
  `);

  for (const row of rows) {
    unreadCounts.set(row.userId, toUnreadCount(row.unreadCount));
  }

  return unreadCounts;
}

export async function markChannelReadState(args: {
  channelId: string;
  lastReadAt: Date;
  lastReadMessageId?: string | null;
  userId: string;
}) {
  await prisma.channelReadState.upsert({
    where: {
      channelId_userId: {
        channelId: args.channelId,
        userId: args.userId,
      },
    },
    update: {
      lastReadAt: args.lastReadAt,
      lastReadMessageId: args.lastReadMessageId ?? null,
      mentionCount: 0,
    },
    create: {
      channelId: args.channelId,
      userId: args.userId,
      lastReadAt: args.lastReadAt,
      lastReadMessageId: args.lastReadMessageId ?? null,
      mentionCount: 0,
    },
  });
}

export async function markChannelReadStates(args: {
  channelId: string;
  lastReadAt: Date;
  lastReadMessageId?: string | null;
  userIds: string[];
}) {
  const uniqueUserIds = Array.from(new Set(args.userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return;
  }

  await prisma.$transaction(
    uniqueUserIds.map((userId) =>
      prisma.channelReadState.upsert({
        where: {
          channelId_userId: {
            channelId: args.channelId,
            userId,
          },
        },
        update: {
          lastReadAt: args.lastReadAt,
          lastReadMessageId: args.lastReadMessageId ?? null,
          mentionCount: 0,
        },
        create: {
          channelId: args.channelId,
          userId,
          lastReadAt: args.lastReadAt,
          lastReadMessageId: args.lastReadMessageId ?? null,
          mentionCount: 0,
        },
      }),
    ),
  );
}

export function getActiveChannelViewerUserIds(channelId: string) {
  const io = getSocketServer();
  if (!io) {
    return [];
  }

  const room = io.sockets.adapter.rooms.get(channelId);
  if (!room) {
    return [];
  }

  const userIds = new Set<string>();
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.data.userId) {
      userIds.add(socket.data.userId);
    }
  }

  return [...userIds];
}

export async function emitServerUnreadUpdateToUser(userId: string, serverId: string) {
  const unreadCount = await getServerUnreadCount(userId, serverId);
  const io = getSocketServer();

  if (io) {
    io.to(`user:${userId}`).emit("server:unread:update", {
      serverId,
      unreadCount,
    });
  }

  return unreadCount;
}

export async function emitServerUnreadUpdatesForServer(
  serverId: string,
  memberUserIds?: string[],
) {
  const userIds =
    memberUserIds && memberUserIds.length > 0
      ? Array.from(new Set(memberUserIds))
      : (
          await prisma.serverMember.findMany({
            where: { serverId },
            select: { userId: true },
          })
        ).map((member) => member.userId);

  const unreadCounts = await getServerUnreadCountsBatch(userIds, serverId);
  const io = getSocketServer();

  if (!io) {
    return;
  }

  await Promise.all(
    userIds.map(async (userId) => {
      io.to(`user:${userId}`).emit("server:unread:update", {
        serverId,
        unreadCount: unreadCounts.get(userId) ?? 0,
      });
    }),
  );
}
