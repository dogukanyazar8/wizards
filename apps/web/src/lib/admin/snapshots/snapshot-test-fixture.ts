import type { AdminSnapshotClient } from "@/lib/admin/snapshots/client";

/**
 * Test-only Prisma double for the admin snapshot loaders. Web unit tests run
 * without a database, so the split has to be provable by injection: every
 * loader reads through {@link AdminSnapshotClient}, and this fixture answers
 * each of the dashboard queries with fixed rows plus a call log the isolation
 * test asserts on.
 */
export const SNAPSHOT_FIXTURE_NOW = new Date("2026-05-12T18:30:00.000Z");
export const SNAPSHOT_FIXTURE_DAYS = 7;

type QueryArgs = {
  by?: string[];
  distinct?: string[];
  where?: {
    OR?: unknown[];
    id?: { in?: string[] };
    isBanned?: boolean;
    isPublic?: boolean;
  };
};

function metricRow(overrides: {
  appSeconds?: number;
  cameraSeconds?: number;
  date: string;
  dmMessageCount?: number;
  fileUploadCount?: number;
  messageCount?: number;
  screenShareSeconds?: number;
  sessionCount?: number;
  uploadedBytes?: bigint;
  userId: string;
  voiceSeconds?: number;
}) {
  return {
    appSeconds: overrides.appSeconds ?? 0,
    cameraSeconds: overrides.cameraSeconds ?? 0,
    date: new Date(overrides.date),
    dmMessageCount: overrides.dmMessageCount ?? 0,
    fileUploadCount: overrides.fileUploadCount ?? 0,
    messageCount: overrides.messageCount ?? 0,
    screenShareSeconds: overrides.screenShareSeconds ?? 0,
    sessionCount: overrides.sessionCount ?? 0,
    uploadedBytes: overrides.uploadedBytes ?? 0n,
    userId: overrides.userId,
    voiceSeconds: overrides.voiceSeconds ?? 0,
  };
}

const METRIC_ROWS = [
  metricRow({
    appSeconds: 90,
    cameraSeconds: 20,
    date: "2026-05-01T00:00:00.000Z",
    dmMessageCount: 2,
    fileUploadCount: 1,
    messageCount: 6,
    screenShareSeconds: 5,
    sessionCount: 2,
    uploadedBytes: 128n,
    userId: "user-1",
    voiceSeconds: 30,
  }),
  metricRow({
    appSeconds: 240,
    cameraSeconds: 60,
    date: "2026-05-06T00:00:00.000Z",
    dmMessageCount: 3,
    fileUploadCount: 4,
    messageCount: 9,
    screenShareSeconds: 15,
    sessionCount: 3,
    uploadedBytes: 512n,
    userId: "user-1",
    voiceSeconds: 120,
  }),
  metricRow({
    appSeconds: 120,
    cameraSeconds: 0,
    date: "2026-05-11T00:00:00.000Z",
    dmMessageCount: 1,
    fileUploadCount: 2,
    messageCount: 4,
    screenShareSeconds: 0,
    sessionCount: 1,
    uploadedBytes: 256n,
    userId: "user-2",
    voiceSeconds: 60,
  }),
];

const SESSION_USERS = {
  "user-1": {
    avatarUrl: "https://cdn.test/avatar-1.png",
    displayName: "Ada",
    email: "ada@test.dev",
    id: "user-1",
    status: "ONLINE",
    username: "ada",
  },
  "user-2": {
    avatarUrl: null,
    displayName: null,
    email: "bora@test.dev",
    id: "user-2",
    status: "IDLE",
    username: "bora",
  },
} as const;

const ACTIVE_SESSION_ROWS = [
  {
    browser: "Chrome",
    clientType: "WEB",
    countryCode: "TR",
    deviceType: "DESKTOP",
    durationSeconds: 900,
    id: "session-1",
    lastSeenAt: new Date("2026-05-12T18:29:00.000Z"),
    os: "Windows",
    startedAt: new Date("2026-05-12T18:14:00.000Z"),
    user: SESSION_USERS["user-1"],
  },
  {
    browser: null,
    clientType: "MOBILE",
    countryCode: null,
    deviceType: "MOBILE",
    durationSeconds: 120,
    id: "session-2",
    lastSeenAt: new Date("2026-05-12T18:28:30.000Z"),
    os: "iOS",
    startedAt: new Date("2026-05-12T18:26:30.000Z"),
    user: SESSION_USERS["user-2"],
  },
];

const LATEST_USERS = [
  {
    avatarUrl: "https://cdn.test/avatar-3.png",
    createdAt: new Date("2026-05-12T09:00:00.000Z"),
    displayName: "Cem",
    email: "cem@test.dev",
    emailVerified: false,
    id: "user-3",
    isBanned: false,
    status: "OFFLINE",
    username: "cem",
  },
  {
    avatarUrl: null,
    createdAt: new Date("2026-05-11T09:00:00.000Z"),
    displayName: null,
    email: "bora@test.dev",
    emailVerified: true,
    id: "user-2",
    isBanned: true,
    status: "IDLE",
    username: "bora",
  },
];

const TOP_USER_ROWS = [SESSION_USERS["user-1"], SESSION_USERS["user-2"]];

const TOP_SERVERS = [
  {
    _count: { channels: 4, members: 120 },
    channels: [
      { messageCount: 400, type: "TEXT" },
      { messageCount: 25, type: "VOICE" },
    ],
    createdAt: new Date("2026-02-01T10:00:00.000Z"),
    iconUrl: "https://cdn.test/server-1.png",
    id: "server-1",
    isPublic: true,
    name: "Whispr HQ",
  },
  {
    _count: { channels: 2, members: 40 },
    channels: [{ messageCount: 60, type: "TEXT" }],
    createdAt: new Date("2026-03-15T10:00:00.000Z"),
    iconUrl: null,
    id: "server-2",
    isPublic: false,
    name: "Kapalı Devre",
  },
];

const TOP_CHANNELS = [
  {
    id: "channel-1",
    messageCount: 400,
    name: "genel",
    server: { id: "server-1", name: "Whispr HQ" },
    type: "TEXT",
  },
  {
    id: "channel-2",
    messageCount: 60,
    name: "duyuru",
    server: null,
    type: "TEXT",
  },
];

const RECENT_MESSAGES = [
  {
    author: {
      avatarUrl: "https://cdn.test/avatar-1.png",
      displayName: "Ada",
      id: "user-1",
      username: "ada",
    },
    channel: {
      id: "channel-1",
      name: "genel",
      server: { id: "server-1", name: "Whispr HQ" },
    },
    content: "  merhaba   dünya  ",
    createdAt: new Date("2026-05-12T18:00:00.000Z"),
    id: "message-1",
    type: "TEXT",
  },
  {
    author: {
      avatarUrl: null,
      displayName: null,
      id: "user-2",
      username: "bora",
    },
    channel: {
      id: "channel-3",
      name: "dm-benzeri",
      server: null,
    },
    content: "",
    createdAt: new Date("2026-05-12T17:00:00.000Z"),
    id: "message-2",
    type: "SYSTEM",
  },
];

const RECENT_CAMPAIGNS = [
  {
    body: "Sürüm notları yayında.",
    completedAt: new Date("2026-05-12T12:05:00.000Z"),
    createdAt: new Date("2026-05-12T12:00:00.000Z"),
    creator: { displayName: "Ada", id: "user-1", username: "ada" },
    failedCount: 1,
    id: "campaign-1",
    segment: { days: 14, type: "RECENTLY_ACTIVE" },
    sentCount: 42,
    startedAt: new Date("2026-05-12T12:01:00.000Z"),
    status: "COMPLETED",
    title: "Sürüm duyurusu",
    type: "SYSTEM",
  },
  {
    body: "Bakım penceresi.",
    completedAt: null,
    createdAt: new Date("2026-05-11T12:00:00.000Z"),
    creator: null,
    failedCount: 0,
    id: "campaign-2",
    segment: null,
    sentCount: 0,
    startedAt: null,
    status: "DRAFT",
    title: "Bakım",
    type: "SYSTEM",
  },
];

const RECENT_AUDIT_LOGS = [
  {
    action: "user.ban",
    adminUser: { displayName: "Ada", id: "user-1", username: "ada" },
    createdAt: new Date("2026-05-12T15:00:00.000Z"),
    id: "audit-1",
    ipHash: "0123456789abcdef",
    targetId: "user-2",
    targetType: "USER",
  },
  {
    action: "system.cleanup",
    adminUser: null,
    createdAt: new Date("2026-05-12T14:00:00.000Z"),
    id: "audit-2",
    ipHash: null,
    targetId: null,
    targetType: "SYSTEM",
  },
];

export type SnapshotTestClient = {
  calls: string[];
  client: AdminSnapshotClient;
  countCalls(delegate: string): number;
};

export function createSnapshotTestClient(): SnapshotTestClient {
  const calls: string[] = [];

  function record<T>(name: string, value: T) {
    calls.push(name);
    return Promise.resolve(value);
  }

  const client = {
    adminAuditLog: {
      findMany: () => record("adminAuditLog.findMany", RECENT_AUDIT_LOGS),
    },
    appSession: {
      findMany: (args: QueryArgs) =>
        args.distinct
          ? record("appSession.findMany:distinct", [{ userId: "user-1" }, { userId: "user-2" }])
          : record("appSession.findMany:active", ACTIVE_SESSION_ROWS),
      groupBy: (args: QueryArgs) => {
        const dimension = args.by?.[0] ?? "unknown";

        switch (dimension) {
          case "clientType":
            return record("appSession.groupBy:clientType", [
              { _count: { _all: 40 }, attributionVerified: false, clientType: "WEB" },
              { _count: { _all: 10 }, attributionVerified: true, clientType: "WEB" },
              { _count: { _all: 25 }, attributionVerified: true, clientType: "MOBILE" },
            ]);
          case "deviceType":
            return record("appSession.groupBy:deviceType", [
              { _count: { _all: 30 }, deviceType: "DESKTOP" },
              { _count: { _all: 45 }, deviceType: "MOBILE" },
            ]);
          case "countryCode":
            return record("appSession.groupBy:countryCode", [
              { _count: { _all: 50 }, countryCode: "TR" },
              { _count: { _all: 5 }, countryCode: null },
            ]);
          case "browser":
            return record("appSession.groupBy:browser", [
              { _count: { _all: 40 }, browser: "Chrome" },
              { _count: { _all: 2 }, browser: "   " },
            ]);
          default:
            return record("appSession.groupBy:os", [
              { _count: { _all: 30 }, os: "Windows" },
              { _count: { _all: 12 }, os: "iOS" },
            ]);
        }
      },
    },
    attachment: {
      aggregate: () =>
        record("attachment.aggregate", { _count: { _all: 320 }, _sum: { size: 9_000 } }),
    },
    channel: {
      findMany: () => record("channel.findMany", TOP_CHANNELS),
      groupBy: () =>
        record("channel.groupBy", [
          { _count: { _all: 30 }, type: "TEXT" },
          { _count: { _all: 9 }, type: "VOICE" },
        ]),
    },
    dMMessage: {
      count: () => record("dMMessage.count", 800),
    },
    mediaUsageSession: {
      groupBy: () =>
        record("mediaUsageSession.groupBy", [
          { _count: { _all: 3 }, kind: "CAMERA" },
          { _count: { _all: 1 }, kind: "SCREEN_SHARE" },
          { _count: { _all: 6 }, kind: "VOICE" },
        ]),
    },
    message: {
      count: () => record("message.count", 5_000),
      findMany: () => record("message.findMany", RECENT_MESSAGES),
    },
    notificationCampaign: {
      findMany: () => record("notificationCampaign.findMany", RECENT_CAMPAIGNS),
    },
    server: {
      count: (args?: QueryArgs) => {
        if (args?.where?.isPublic) {
          return record("server.count:public", 12);
        }

        if (args?.where?.OR) {
          return record("server.count:active", 7);
        }

        return record("server.count:total", 40);
      },
      findMany: () => record("server.findMany", TOP_SERVERS),
    },
    user: {
      count: (args?: QueryArgs) => {
        if (args?.where?.isBanned) {
          return record("user.count:banned", 12);
        }

        if (args?.where) {
          return record("user.count:verified", 900);
        }

        return record("user.count:total", 1_204);
      },
      findMany: (args?: QueryArgs) =>
        args?.where?.id?.in
          ? record("user.findMany:topUsers", TOP_USER_ROWS)
          : record("user.findMany:latest", LATEST_USERS),
      groupBy: () =>
        record("user.groupBy:status", [
          { _count: { _all: 5 }, status: "ONLINE" },
          { _count: { _all: 2 }, status: "IDLE" },
          { _count: { _all: 1 }, status: "DND" },
          { _count: { _all: 40 }, status: "OFFLINE" },
          { _count: { _all: 3 }, status: "INVISIBLE" },
        ]),
    },
    userDailyMetric: {
      findMany: () => record("userDailyMetric.findMany", METRIC_ROWS),
    },
  } as unknown as AdminSnapshotClient;

  return {
    calls,
    client,
    countCalls: (delegate: string) =>
      calls.filter((call) => call === delegate || call.startsWith(`${delegate}.`)).length,
  };
}
