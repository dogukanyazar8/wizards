import type { AnalyticsMediaKind, Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";
import { logError } from "@/lib/logger";
import { getAnalyticsClientInfo, type AnalyticsClientInfo } from "@/lib/analytics/client-info";
import {
  resolveVerifiedAttribution,
  type ClientAttribution,
} from "@/lib/analytics/client-attribution";

type MetricIncrements = {
  appSeconds?: number;
  cameraSeconds?: number;
  dmMessageCount?: number;
  fileUploadCount?: number;
  messageCount?: number;
  screenShareSeconds?: number;
  sessionCount?: number;
  uploadedBytes?: bigint | number;
  voiceSeconds?: number;
};

type HeaderSource = Parameters<typeof getAnalyticsClientInfo>[0];

type AnalyticsMetricClient = {
  userDailyMetric: {
    upsert(args: Prisma.UserDailyMetricUpsertArgs): Promise<unknown>;
  };
};

const MEDIA_METRIC_FIELD: Record<AnalyticsMediaKind, keyof MetricIncrements> = {
  CAMERA: "cameraSeconds",
  SCREEN_SHARE: "screenShareSeconds",
  VOICE: "voiceSeconds",
};

function positiveInt(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function positiveBigInt(value: bigint | number | undefined) {
  if (typeof value === "bigint") {
    return value > 0n ? value : 0n;
  }

  return BigInt(positiveInt(value));
}

export function getUtcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function splitIntervalByUtcDay(startedAt: Date, endedAt: Date) {
  if (endedAt <= startedAt) {
    return [];
  }

  const ranges: Array<{ date: Date; seconds: number }> = [];
  let cursor = startedAt;

  while (cursor < endedAt) {
    const nextDay = getUtcDayStart(
      new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1)),
    );
    const segmentEnd = nextDay < endedAt ? nextDay : endedAt;
    const seconds = positiveInt((segmentEnd.getTime() - cursor.getTime()) / 1000);

    if (seconds > 0) {
      ranges.push({
        date: getUtcDayStart(cursor),
        seconds,
      });
    }

    cursor = segmentEnd;
  }

  return ranges;
}

/**
 * The attribution parameter is deliberately required. A default would let a new
 * metric writer record UNKNOWN without anybody noticing; a caller that really
 * has no client passes `UNKNOWN_ATTRIBUTION` and says so in the code.
 */
export async function incrementUserDailyMetric(
  userId: string,
  increments: MetricIncrements,
  attribution: ClientAttribution,
  date = new Date(),
  client: AnalyticsMetricClient = prisma,
) {
  const metricDate = getUtcDayStart(date);
  const uploadedBytes = positiveBigInt(increments.uploadedBytes);

  await client.userDailyMetric.upsert({
    where: {
      date_userId_clientType: {
        clientType: attribution.clientType,
        date: metricDate,
        userId,
      },
    },
    create: {
      appSeconds: positiveInt(increments.appSeconds),
      appVersion: attribution.appVersion,
      cameraSeconds: positiveInt(increments.cameraSeconds),
      clientType: attribution.clientType,
      date: metricDate,
      dmMessageCount: positiveInt(increments.dmMessageCount),
      fileUploadCount: positiveInt(increments.fileUploadCount),
      messageCount: positiveInt(increments.messageCount),
      screenShareSeconds: positiveInt(increments.screenShareSeconds),
      sessionCount: positiveInt(increments.sessionCount),
      uploadedBytes,
      userId,
      voiceSeconds: positiveInt(increments.voiceSeconds),
    },
    update: {
      appSeconds: { increment: positiveInt(increments.appSeconds) },
      // "Last version seen that day" — but a client that stopped reporting its
      // version must not wipe a version we already know.
      ...(attribution.appVersion === null ? {} : { appVersion: attribution.appVersion }),
      cameraSeconds: { increment: positiveInt(increments.cameraSeconds) },
      dmMessageCount: { increment: positiveInt(increments.dmMessageCount) },
      fileUploadCount: { increment: positiveInt(increments.fileUploadCount) },
      messageCount: { increment: positiveInt(increments.messageCount) },
      screenShareSeconds: { increment: positiveInt(increments.screenShareSeconds) },
      sessionCount: { increment: positiveInt(increments.sessionCount) },
      uploadedBytes: { increment: uploadedBytes },
      voiceSeconds: { increment: positiveInt(increments.voiceSeconds) },
    },
  });
}

export async function incrementMetricAcrossInterval(
  userId: string,
  startedAt: Date,
  endedAt: Date,
  field: keyof MetricIncrements,
  attribution: ClientAttribution,
  client: AnalyticsMetricClient = prisma,
) {
  for (const segment of splitIntervalByUtcDay(startedAt, endedAt)) {
    await incrementUserDailyMetric(
      userId,
      { [field]: segment.seconds },
      attribution,
      segment.date,
      client,
    );
  }
}

export async function startAppSession(args: {
  clientInfo?: AnalyticsClientInfo;
  headers?: HeaderSource;
  sessionKey: string;
  socketId?: string | null;
  startedAt?: Date;
  userId: string;
}) {
  const existing = await prisma.appSession.findUnique({
    where: { sessionKey: args.sessionKey },
    select: { id: true },
  });
  const clientInfo = args.clientInfo ?? getAnalyticsClientInfo(args.headers);
  const startedAt = args.startedAt ?? new Date();

  if (existing) {
    await prisma.appSession.update({
      where: { sessionKey: args.sessionKey },
      data: {
        endedAt: null,
        lastSeenAt: startedAt,
        socketId: args.socketId ?? null,
      },
    });
    return;
  }

  await prisma.appSession.create({
    data: {
      appVersion: clientInfo.appVersion,
      attributionVerified: clientInfo.attributionVerified,
      browser: clientInfo.browser,
      clientType: clientInfo.clientType,
      countryCode: clientInfo.countryCode,
      deviceType: clientInfo.deviceType,
      ipHash: clientInfo.ipHash,
      lastSeenAt: startedAt,
      os: clientInfo.os,
      sessionKey: args.sessionKey,
      socketId: args.socketId ?? null,
      startedAt,
      userAgentHash: clientInfo.userAgentHash,
      userId: args.userId,
    },
  });

  await incrementUserDailyMetric(
    args.userId,
    { sessionCount: 1 },
    resolveVerifiedAttribution({
      appVersion: clientInfo.appVersion,
      attributionVerified: clientInfo.attributionVerified,
      clientType: clientInfo.clientType,
    }),
    startedAt,
  );
}

export async function heartbeatAppSession(sessionKey: string, seenAt = new Date()) {
  const session = await prisma.appSession.findUnique({
    where: { sessionKey },
    select: {
      endedAt: true,
      startedAt: true,
    },
  });

  if (!session || session.endedAt) {
    return;
  }

  await prisma.appSession.update({
    where: { sessionKey },
    data: {
      durationSeconds: positiveInt((seenAt.getTime() - session.startedAt.getTime()) / 1000),
      lastSeenAt: seenAt,
    },
  });
}

export async function endAppSession(
  sessionKey: string,
  endReason = "DISCONNECT",
  endedAt = new Date(),
) {
  const session = await prisma.appSession.findUnique({
    where: { sessionKey },
    select: {
      appVersion: true,
      attributionVerified: true,
      clientType: true,
      endedAt: true,
      startedAt: true,
      userId: true,
    },
  });

  if (!session || session.endedAt) {
    return;
  }

  const durationSeconds = positiveInt((endedAt.getTime() - session.startedAt.getTime()) / 1000);

  await prisma.appSession.update({
    where: { sessionKey },
    data: {
      durationSeconds,
      endedAt,
      endReason,
      lastSeenAt: endedAt,
    },
  });

  await incrementMetricAcrossInterval(
    session.userId,
    session.startedAt,
    endedAt,
    "appSeconds",
    resolveVerifiedAttribution(session),
  );
}

export async function recordMessageCreated(
  args: {
    attachmentCount?: number;
    isDm?: boolean;
    uploadedBytes?: bigint | number;
    userId: string;
  },
  attribution: ClientAttribution,
  client: AnalyticsMetricClient = prisma,
) {
  await incrementUserDailyMetric(
    args.userId,
    {
      dmMessageCount: args.isDm ? 1 : 0,
      fileUploadCount: args.attachmentCount ?? 0,
      messageCount: args.isDm ? 0 : 1,
      uploadedBytes: args.uploadedBytes ?? 0,
    },
    attribution,
    new Date(),
    client,
  );
}

export async function startMediaUsageSession(args: {
  attribution: ClientAttribution;
  channelId?: string | null;
  kind: AnalyticsMediaKind;
  serverId?: string | null;
  sessionId: string;
  startedAt?: Date;
  userId: string;
}) {
  const active = await prisma.mediaUsageSession.findFirst({
    where: {
      endedAt: null,
      kind: args.kind,
      sessionId: args.sessionId,
      userId: args.userId,
    },
    select: { id: true },
  });

  if (active) {
    await prisma.mediaUsageSession.update({
      where: { id: active.id },
      data: {
        channelId: args.channelId ?? null,
        serverId: args.serverId ?? null,
      },
    });
    return;
  }

  await prisma.mediaUsageSession.create({
    data: {
      channelId: args.channelId ?? null,
      // Voice has no join path back to AppSession, so the row carries its own
      // client and the daily metric reads it back on close.
      clientType: args.attribution.clientType,
      kind: args.kind,
      serverId: args.serverId ?? null,
      sessionId: args.sessionId,
      startedAt: args.startedAt ?? new Date(),
      userId: args.userId,
    },
  });
}

export async function endMediaUsageSession(args: {
  endedAt?: Date;
  kind: AnalyticsMediaKind;
  sessionId: string;
  userId: string;
}) {
  const session = await prisma.mediaUsageSession.findFirst({
    where: {
      endedAt: null,
      kind: args.kind,
      sessionId: args.sessionId,
      userId: args.userId,
    },
    orderBy: { startedAt: "desc" },
    select: {
      clientType: true,
      id: true,
      startedAt: true,
    },
  });

  if (!session) {
    return;
  }

  const endedAt = args.endedAt ?? new Date();
  const durationSeconds = positiveInt((endedAt.getTime() - session.startedAt.getTime()) / 1000);

  await prisma.mediaUsageSession.update({
    where: { id: session.id },
    data: {
      durationSeconds,
      endedAt,
    },
  });

  await incrementMetricAcrossInterval(
    args.userId,
    session.startedAt,
    endedAt,
    MEDIA_METRIC_FIELD[args.kind],
    { appVersion: null, clientType: session.clientType },
  );
}

export async function endAllMediaUsageSessionsForVoiceSession(
  userId: string,
  sessionId: string,
  endedAt = new Date(),
) {
  const sessions = await prisma.mediaUsageSession.findMany({
    where: {
      endedAt: null,
      sessionId,
      userId,
    },
    select: {
      clientType: true,
      id: true,
      kind: true,
      startedAt: true,
    },
  });

  for (const session of sessions) {
    const durationSeconds = positiveInt((endedAt.getTime() - session.startedAt.getTime()) / 1000);
    await prisma.mediaUsageSession.update({
      where: { id: session.id },
      data: {
        durationSeconds,
        endedAt,
      },
    });
    await incrementMetricAcrossInterval(
      userId,
      session.startedAt,
      endedAt,
      MEDIA_METRIC_FIELD[session.kind],
      { appVersion: null, clientType: session.clientType },
    );
  }
}

export async function setVoiceScreenShareUsage(args: {
  attribution: ClientAttribution;
  channelId: string;
  isScreenSharing: boolean;
  serverId: string;
  userId: string;
}) {
  const state = await prisma.voiceState.findUnique({
    where: { userId: args.userId },
    select: {
      channelId: true,
      serverId: true,
      sessionId: true,
    },
  });

  if (!state || state.channelId !== args.channelId || state.serverId !== args.serverId) {
    return;
  }

  if (args.isScreenSharing) {
    await startMediaUsageSession({
      attribution: args.attribution,
      channelId: state.channelId,
      kind: "SCREEN_SHARE",
      serverId: state.serverId,
      sessionId: state.sessionId,
      userId: args.userId,
    });
    return;
  }

  await endMediaUsageSession({
    kind: "SCREEN_SHARE",
    sessionId: state.sessionId,
    userId: args.userId,
  });
}

export function logAnalyticsError(scope: string, error: unknown) {
  logError(`[analytics] ${scope}`, error);
}
