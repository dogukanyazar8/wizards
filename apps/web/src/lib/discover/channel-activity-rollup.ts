import { ChannelType, prisma } from "@wizards/db";

import { isChannelVisibleToEveryone } from "@/lib/discover/channels-service";
import type {
  ChannelPermissionOverrideRecord,
  RolePermissionRecord,
} from "@/lib/workspace/permissions";

const DISCOVER_ACTIVITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type DiscoverActivityRollupChannel = {
  id: string;
  permissionOverrides: ChannelPermissionOverrideRecord[];
  server: {
    discoverable: boolean;
    isPublic: boolean;
    ownerId: string;
    roles: RolePermissionRecord[];
  } | null;
  type: ChannelType;
};

type CountMessagesInput = {
  channelIds: string[];
  createdAt: { gte: Date; lt: Date };
  deletedAt: null;
};

type DiscoverActivityRow = {
  channelId: string;
  messageCount: number;
  windowStart: Date;
};

export type ChannelActivityRollupOperations = {
  countMessages(input: CountMessagesInput): Promise<Array<{ channelId: string; count: number }>>;
  insertRows(rows: DiscoverActivityRow[]): Promise<number>;
  loadChannels(): Promise<DiscoverActivityRollupChannel[]>;
  pruneRows(before: Date): Promise<number>;
};

const defaultOperations: ChannelActivityRollupOperations = {
  countMessages: async (input) => {
    const counts = await prisma.message.groupBy({
      by: ["channelId"],
      _count: { _all: true },
      where: {
        channelId: { in: input.channelIds },
        createdAt: input.createdAt,
        deletedAt: input.deletedAt,
      },
    });

    return counts.map((row) => ({ channelId: row.channelId, count: row._count._all }));
  },
  insertRows: async (rows) => {
    if (rows.length === 0) {
      return 0;
    }

    const result = await prisma.discoverChannelActivity.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return result.count;
  },
  loadChannels: async () => {
    const channels = await prisma.channel.findMany({
      where: {
        type: ChannelType.TEXT,
        server: { discoverable: true, isPublic: true },
      },
      select: {
        id: true,
        permissionOverrides: {
          select: { allow: true, deny: true, targetId: true, targetType: true },
        },
        server: {
          select: {
            discoverable: true,
            isPublic: true,
            ownerId: true,
            roles: {
              where: { isDefault: true },
              select: { id: true, isDefault: true, permissions: true },
            },
          },
        },
        type: true,
      },
    });

    return channels;
  },
  pruneRows: async (before) => {
    const result = await prisma.discoverChannelActivity.deleteMany({
      where: { windowStart: { lt: before } },
    });
    return result.count;
  },
};

function startOfUtcHour(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
  );
}

function isRollupChannelVisible(channel: DiscoverActivityRollupChannel): boolean {
  const server = channel.server;
  return Boolean(
    channel.type === ChannelType.TEXT &&
    server?.discoverable &&
    server.isPublic &&
    isChannelVisibleToEveryone({
      ownerId: server.ownerId,
      overrides: channel.permissionOverrides,
      roles: server.roles,
    }),
  );
}

export async function rollUpDiscoverChannelActivity({
  now = new Date(),
  operations = defaultOperations,
}: {
  now?: Date;
  operations?: ChannelActivityRollupOperations;
} = {}): Promise<{ rows: number }> {
  const windowEnd = startOfUtcHour(now);
  const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);
  const channels = await operations.loadChannels();
  const channelIds = channels.filter(isRollupChannelVisible).map((channel) => channel.id);
  let rows = 0;

  if (channelIds.length > 0) {
    const counts = await operations.countMessages({
      channelIds,
      createdAt: { gte: windowStart, lt: windowEnd },
      deletedAt: null,
    });
    rows = await operations.insertRows(
      counts.map((count) => ({
        channelId: count.channelId,
        messageCount: count.count,
        windowStart,
      })),
    );
  }

  await operations.pruneRows(new Date(now.getTime() - DISCOVER_ACTIVITY_RETENTION_MS));
  return { rows };
}
