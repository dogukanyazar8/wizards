import type { ChannelType } from "@wizards/db";
import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import { DAY_MS, mapCountBreakdown } from "@/lib/admin/snapshots/shared";

/** Server health, the busiest servers and channels behind the Sunucular module. */
export async function loadAdminServersSnapshot(
  { now }: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const last24h = new Date(now.getTime() - DAY_MS);

  const [totalServers, publicServers, activeServers, channelGroups, topServers, topChannels] =
    await Promise.all([
      client.server.count(),
      client.server.count({ where: { isPublic: true } }),
      client.server.count({
        where: {
          OR: [
            {
              mediaUsageSessions: {
                some: {
                  endedAt: null,
                  startedAt: { gte: last24h },
                },
              },
            },
            {
              channels: {
                some: {
                  messages: {
                    some: {
                      createdAt: { gte: last24h },
                      deletedAt: null,
                    },
                  },
                },
              },
            },
          ],
        },
      }),
      client.channel.groupBy({
        by: ["type"],
        _count: { _all: true },
      }),
      client.server.findMany({
        orderBy: [{ members: { _count: "desc" } }, { createdAt: "desc" }],
        take: 8,
        select: {
          _count: {
            select: {
              channels: true,
              members: true,
            },
          },
          channels: {
            select: {
              messageCount: true,
              type: true,
            },
          },
          createdAt: true,
          iconUrl: true,
          id: true,
          isPublic: true,
          name: true,
        },
      }),
      client.channel.findMany({
        orderBy: [{ messageCount: "desc" }, { createdAt: "desc" }],
        take: 10,
        where: { serverId: { not: null } },
        select: {
          id: true,
          messageCount: true,
          name: true,
          server: {
            select: {
              id: true,
              name: true,
            },
          },
          type: true,
        },
      }),
    ]);

  const channelTypeMap = new Map<ChannelType, number>(
    channelGroups.map((group) => [group.type, group._count._all]),
  );

  return {
    channelBreakdown: mapCountBreakdown<ChannelType>(channelGroups, "type"),
    serverHealth: {
      activeServers,
      publicServers,
      textChannels: channelTypeMap.get("TEXT") ?? 0,
      totalChannels: channelGroups.reduce((total, group) => total + group._count._all, 0),
      totalServers,
      voiceChannels: channelTypeMap.get("VOICE") ?? 0,
    },
    topChannels: topChannels.map((channel) => ({
      id: channel.id,
      messageCount: channel.messageCount,
      name: channel.name,
      server: channel.server
        ? {
            id: channel.server.id,
            name: channel.server.name,
          }
        : null,
      type: channel.type,
    })),
    topServers: topServers.map((server) => ({
      channelCount: server._count.channels,
      createdAt: server.createdAt.toISOString(),
      iconUrl: server.iconUrl,
      id: server.id,
      isPublic: server.isPublic,
      memberCount: server._count.members,
      messageCount: server.channels.reduce((total, channel) => total + channel.messageCount, 0),
      name: server.name,
      voiceChannelCount: server.channels.filter((channel) => channel.type === "VOICE").length,
    })),
  };
}

export type AdminServersSnapshot = Awaited<ReturnType<typeof loadAdminServersSnapshot>>;
