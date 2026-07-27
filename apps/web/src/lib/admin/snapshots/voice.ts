import type { AnalyticsClientType, PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";
import type { AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import { DAY_MS } from "@/lib/admin/snapshots/shared";

/** A voice state stops counting as live once its heartbeat goes quiet. */
export const VOICE_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;
const LIVE_CHANNEL_LIMIT = 8;
const SESSION_SCAN_LIMIT = 5_000;

export type AdminVoiceClient = Pick<PrismaClient, "channel" | "mediaUsageSession" | "voiceState">;

export function buildHourlyHistogram(startedAt: Date[], now: Date) {
  const counts = new Array<number>(24).fill(0);

  for (const value of startedAt) {
    counts[value.getUTCHours()] = (counts[value.getUTCHours()] ?? 0) + 1;
  }

  const currentHour = now.getUTCHours();

  return counts.map((count, hour) => ({
    count,
    hour,
    isCurrent: hour === currentHour,
    label: `${String(hour).padStart(2, "0")}:00`,
  }));
}

export function averageDurationSeconds(durations: number[]) {
  if (durations.length === 0) {
    return null;
  }

  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
}

export async function loadAdminVoiceSnapshot(
  { now }: AdminSnapshotInput,
  client: AdminVoiceClient = prisma,
) {
  const liveSince = new Date(now.getTime() - VOICE_HEARTBEAT_WINDOW_MS);
  const last24h = new Date(now.getTime() - DAY_MS);

  const [liveStates, channelGroups, sessions, platformGroups] = await Promise.all([
    client.voiceState.count({ where: { lastHeartbeat: { gte: liveSince } } }),
    client.voiceState.groupBy({
      by: ["channelId"],
      _count: { _all: true },
      orderBy: { _count: { channelId: "desc" } },
      take: LIVE_CHANNEL_LIMIT,
      where: { lastHeartbeat: { gte: liveSince } },
    }),
    client.mediaUsageSession.findMany({
      orderBy: { startedAt: "desc" },
      take: SESSION_SCAN_LIMIT,
      where: { kind: "VOICE", startedAt: { gte: last24h } },
      select: { durationSeconds: true, endedAt: true, startedAt: true },
    }),
    client.mediaUsageSession.groupBy({
      by: ["clientType"],
      _count: { _all: true },
      where: { kind: "VOICE", startedAt: { gte: last24h } },
    }),
  ]);

  const channels =
    channelGroups.length === 0
      ? []
      : await client.channel.findMany({
          where: { id: { in: channelGroups.map((group) => group.channelId) } },
          select: { id: true, name: true, server: { select: { id: true, name: true } } },
        });
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  return {
    generatedAt: now.toISOString(),
    liveChannels: channelGroups.map((group) => {
      const channel = channelById.get(group.channelId);

      return {
        channelId: group.channelId,
        name: channel?.name ?? "silinmiş kanal",
        participantCount: group._count._all,
        server: channel?.server ? { id: channel.server.id, name: channel.server.name } : null,
      };
    }),
    /** Only sessions that already ended can report a duration. */
    averageCallSeconds: averageDurationSeconds(
      sessions
        .filter((session) => session.endedAt !== null)
        .map((session) => session.durationSeconds),
    ),
    callsLast24h: sessions.length,
    concurrentVoice: liveStates,
    hourly: buildHourlyHistogram(
      sessions.map((session) => session.startedAt),
      now,
    ),
    platforms: platformGroups
      .map((group) => ({
        count: group._count._all,
        platform: group.clientType as AnalyticsClientType,
      }))
      .sort((left, right) => right.count - left.count),
  };
}

export type AdminVoiceSnapshot = Awaited<ReturnType<typeof loadAdminVoiceSnapshot>>;
